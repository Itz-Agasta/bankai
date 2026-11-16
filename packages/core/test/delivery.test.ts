import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { checkDelivery } from "../src/delivery";
import { BankaiFailure } from "../src/errors";
import { fakeVision, memoryTracer, type VisionModel } from "../src/models";
import type { Project } from "../src/project/types";
import { loadMini } from "./helpers";

const PLATE = join(import.meta.dir, "fixtures/plate.jpg");

let mini: Project;
beforeAll(async () => {
  mini = await loadMini();
});

/** Delivery photos: no nameplate, no tag, only components. */
const vision = (id: string, components: string[]) =>
  fakeVision(id, { "*": { plate: null, tags: [], fields: {}, components } });

function deps(primary: string[] = [], checker: string[] = primary, project = mini) {
  return {
    project,
    models: { primary: vision("p", primary), checker: vision("c", checker) },
    tracer: memoryTracer("t"),
  };
}

const completeness = (r: Awaited<ReturnType<typeof checkDelivery>>) =>
  r.verdict.checks.find((c) => c.name === "completeness")!;

describe("checkDelivery", () => {
  test("a short delivery is flagged, cites the ticket lines and proposes what arrived", async () => {
    const r = await checkDelivery({ po: "PO-1042", line: 14, ticket: "DT-88" }, deps());
    expect(r.verdict.status).toBe("flagged");
    expect(r.verdict.confidence).toBe(1);
    const c = completeness(r);
    expect(c.result).toBe("fail");
    expect(c.reason).toContain("controls cabinet");
    const refs = c.citations.map((x) => x.ref);
    expect(refs).toContain("DT-88#L1");
    expect(refs).toContain("DT-88#L2");
    expect(refs).toContain("PO-1042#L14");
    expect(r.proposed_updates).toHaveLength(1);
    expect(r.proposed_updates[0]).toMatchObject({
      id: `upd_${r.verdict.id}_1`,
      field: "received_components",
      new: "generator, day tank; missing: controls cabinet",
      target: { kind: "po_line", ref: "PO-1042#L14" },
    });
  });

  test("a PO line with no delivery yet reports every component missing", async () => {
    const r = await checkDelivery({ po: "PO-1042", line: 15 }, deps());
    const c = completeness(r);
    expect(c.result).toBe("fail");
    expect(c.reason).toBe("missing: generator, controls cabinet, day tank");
    expect(c.citations.map((x) => x.ref)).toContain("PO-1042#L15");
    expect(r.proposed_updates[0]!.new).toBe(
      "(nothing received); missing: generator, controls cabinet, day tank",
    );
  });

  test("an unknown PO is NOT_FOUND", async () => {
    const err = await checkDelivery({ po: "PO-9" }, deps()).catch((e) => e);
    expect(err).toBeInstanceOf(BankaiFailure);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("no PO line PO-9 in this project");
  });

  test("a ticket with no lines for this PO line is NOT_FOUND, not an empty delivery", async () => {
    const err = await checkDelivery({ po: "PO-1042", line: 14, ticket: "DT-99" }, deps()).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(BankaiFailure);
    expect(err.code).toBe("NOT_FOUND");
  });

  test("a PO with several lines needs the line number", async () => {
    const err = await checkDelivery({ po: "PO-1042" }, deps()).catch((e) => e);
    expect(err).toBeInstanceOf(BankaiFailure);
    expect(err.code).toBe("INPUT_UNSUPPORTED");
  });

  test("a PO line listing no components needs a human", async () => {
    const poLines = mini.poLines.map((l) => (l.line === 14 ? { ...l, components: [] } : l));
    const project = { ...mini, poLines, poByTag: new Map(poLines.map((l) => [l.tag, l])) };
    const r = await checkDelivery({ po: "PO-1042", line: 14 }, deps([], [], project));
    expect(completeness(r).result).toBe("unknown");
    expect(r.verdict.status).toBe("needs_human");
  });

  test("a photo both models agree shows the missing part completes the delivery, no nameplate needed", async () => {
    const r = await checkDelivery(
      { po: "PO-1042", line: 14, ticket: "DT-88", photos: [PLATE] },
      deps(["controls cabinet"]),
    );
    expect(r.verdict.subject_tag).toBe("GEN-3");
    expect(completeness(r).result).toBe("pass");
    const refs = completeness(r).citations.map((x) => x.ref);
    expect(refs).toContain("DT-88#L1");
    expect(refs).toContain("plate.jpg#full");
    expect(r.verdict.models).toEqual(["p", "c"]);
    expect(r.proposed_updates).toEqual([]);
  });

  test("a part only one model sees does not count", async () => {
    const r = await checkDelivery(
      { po: "PO-1042", line: 14, ticket: "DT-88", photos: [PLATE] },
      deps(["controls cabinet"], []),
    );
    expect(completeness(r).result).toBe("fail");
  });

  test("a model failure while listing components is PERCEPTION_UNAVAILABLE", async () => {
    const broken: VisionModel = {
      ...vision("p", []),
      components: () => Promise.reject(new Error("boom")),
    };
    const d = { ...deps(), models: { primary: broken, checker: vision("c", []) } };
    const err = await checkDelivery({ po: "PO-1042", line: 14, photos: [PLATE] }, d).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(BankaiFailure);
    expect(err.code).toBe("PERCEPTION_UNAVAILABLE");
  });
});
