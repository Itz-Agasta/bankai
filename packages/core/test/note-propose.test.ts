import { beforeAll, describe, expect, test } from "bun:test";
import type { RawClaim } from "../src/models/extract";
import type { GroundedClaim } from "../src/note/ground";
import { linkClaim } from "../src/note/link";
import { proposeForClaim } from "../src/note/propose";
import type { Project } from "../src/project/types";
import { loadMini } from "./helpers";

let mini: Project;
beforeAll(async () => {
  mini = await loadMini();
});

const SPAN = { kind: "audio_span" as const, ref: "n.wav@0.0-2.0", quote: "q" };

const claim = (over: Partial<RawClaim>): GroundedClaim => ({
  type: "status",
  word_start: 0,
  word_end: 3,
  tag: null,
  activity_id: null,
  status_value: null,
  location: null,
  delay_days: null,
  spoken_date: null,
  component: null,
  issue_kind: null,
  owner_role: null,
  text: "x",
  span: SPAN,
  exact: true,
  doubt: null,
  ...over,
});

const run = (c: GroundedClaim) => proposeForClaim(c, linkClaim(c, mini), mini, "note_abc", "1");

describe("linkClaim", () => {
  test("a known tag links its equipment row, PO line and only activity", () => {
    const l = linkClaim(claim({ tag: "GEN-3" }), mini);
    expect(l.unknown).toBe(false);
    expect(l.score).toBe(1);
    expect(l.activity).toBe("A10");
    expect(l.links.map((x) => x.ref)).toEqual([
      "equipment_schedule.csv#GEN-3",
      "PO-1042#L14",
      "A10",
    ]);
  });

  test("an unknown tag keeps no links and is unknown", () => {
    const l = linkClaim(claim({ tag: "GEN-9" }), mini);
    expect(l.unknown).toBe(true);
    expect(l.links).toEqual([]);
    expect(l.score).toBe(0);
  });

  test("a decision with no record is not unknown", () => {
    const l = linkClaim(claim({ type: "decision", text: "use the alternate route" }), mini);
    expect(l).toEqual({ links: [], score: 1, unknown: false, activity: null });
  });
});

describe("proposeForClaim", () => {
  test("set on PAD-B proposes install_status", () => {
    const r = run(claim({ tag: "GEN-3", status_value: "set", location: "PAD-B" }));
    expect(r.needsHuman).toBeNull();
    expect(r.checks.map((c) => [c.name, c.result])).toEqual([
      ["location", "pass"],
      ["revision", "pass"],
    ]);
    expect(r.update).toMatchObject({
      id: "upd_note_abc_1",
      target: { kind: "equipment_schedule_row", ref: "equipment_schedule.csv#GEN-3" },
      field: "install_status",
      old: "",
      new: "set at PAD-B",
      approval: "pending",
    });
    expect(r.update!.evidence[0]).toEqual(SPAN);
  });

  test("set on PAD-A matches a superseded revision: flagged, no proposal", () => {
    const r = run(claim({ tag: "GEN-3", status_value: "set", location: "PAD-A" }));
    expect(r.update).toBeNull();
    expect(r.needsHuman).toBeNull();
    expect(r.checks.find((c) => c.name === "revision")?.result).toBe("fail");
    expect(r.checks.find((c) => c.name === "location")?.result).toBe("fail");
  });

  test("delivered proposes delivery_status on the PO line", () => {
    const r = run(claim({ tag: "GEN-3", status_value: "delivered" }));
    expect(r.update).toMatchObject({
      target: { ref: "PO-1042#L14" },
      field: "delivery_status",
      new: "delivered",
    });
  });

  test("a delay of 3 on A30 proposes delay_days 0 -> 3 with its schedule impact", () => {
    const r = run(claim({ type: "date_change", activity_id: "A30", delay_days: 3 }));
    expect(r.update).toMatchObject({
      target: { kind: "schedule_activity", ref: "A30" },
      field: "delay_days",
      old: "0",
      new: "3",
    });
    const impact = r.checks.find((c) => c.name === "schedule_impact");
    expect(impact?.result).toBe("fail");
    expect(impact?.reason).toContain("Energization slips 3 days");
  });

  test("a spoken date with no day count needs a human", () => {
    const r = run(claim({ type: "date_change", activity_id: "A30", spoken_date: "Friday" }));
    expect(r.update).toBeNull();
    expect(r.needsHuman).toBe("date_not_convertible");
  });

  test("an issue on a component not on the PO needs a human", () => {
    const r = run(
      claim({ type: "issue", tag: "GEN-3", component: "radiator", issue_kind: "damaged" }),
    );
    expect(r.update).toBeNull();
    expect(r.needsHuman).toBe("component_not_on_po");
  });

  test("an issue on a PO component proposes it on the PO line", () => {
    const r = run(
      claim({ type: "issue", tag: "GEN-3", component: "controls cabinet", issue_kind: "damaged" }),
    );
    expect(r.update).toMatchObject({
      target: { ref: "PO-1042#L14" },
      field: "issues",
      new: "controls cabinet damaged",
    });
  });

  test("decisions and actions propose new rows", () => {
    const d = run(claim({ type: "decision", text: "use the alternate cable route" }));
    expect(d.update).toMatchObject({
      target: { kind: "decision", ref: "decisions.json#new-1" },
      field: "text",
      new: "use the alternate cable route",
    });
    const a = run(
      claim({ type: "action_item", owner_role: "ELEC-02", text: "confirm cable delivery" }),
    );
    expect(a.update).toMatchObject({
      target: { kind: "action_item", ref: "actions.json#new-1" },
      new: "ELEC-02: confirm cable delivery",
    });
    const u = run(claim({ type: "action_item", text: "confirm cable delivery" }));
    expect(u.update?.new).toBe("unassigned: confirm cable delivery");
  });

  test("an unknown tag needs a human and proposes nothing", () => {
    const r = run(claim({ tag: "GEN-9", status_value: "set" }));
    expect(r.update).toBeNull();
    expect(r.needsHuman).toBe("unknown_record");
  });
});
