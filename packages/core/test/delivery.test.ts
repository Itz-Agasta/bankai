import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { BankaiFailure } from "../src/errors";
import { checkDelivery } from "../src/delivery";
import { fakeVision, memoryTracer } from "../src/models";
import type { Project } from "../src/project/types";
import { loadMini } from "./helpers";

const PLATE = join(import.meta.dir, "fixtures/plate.jpg");
const GEN = {
  manufacturer: "Cummins",
  model: "C2000D6",
  voltage: "415",
  kva: "2000",
  phase: "3",
  frequency: "50",
};

let mini: Project;
beforeAll(async () => {
  mini = await loadMini();
});

function deps(components: string[] = []) {
  const entry = {
    "*": { plate: { x: 200, y: 150, w: 400, h: 260 }, tags: ["GEN-3"], fields: GEN, components },
  };
  return {
    project: mini,
    models: { primary: fakeVision("p", entry), checker: fakeVision("c", entry) },
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
  });

  test("an unknown PO is NOT_FOUND", async () => {
    const err = await checkDelivery({ po: "PO-9" }, deps()).catch((e) => e);
    expect(err).toBeInstanceOf(BankaiFailure);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("no PO line PO-9 in this project");
  });

  test("a PO with several lines needs the line number", async () => {
    const err = await checkDelivery({ po: "PO-1042" }, deps()).catch((e) => e);
    expect(err).toBeInstanceOf(BankaiFailure);
    expect(err.code).toBe("INPUT_UNSUPPORTED");
  });

  test("a photo showing the missing part completes the delivery", async () => {
    const r = await checkDelivery(
      { po: "PO-1042", line: 14, ticket: "DT-88", photos: [PLATE] },
      deps(["controls cabinet"]),
    );
    expect(completeness(r).result).toBe("pass");
    expect(completeness(r).citations.map((x) => x.ref)).toContain("DT-88#L1");
    expect(r.proposed_updates).toEqual([]);
  });
});
