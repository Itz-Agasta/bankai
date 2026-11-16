import type { Activity, Check, Range } from "@bankai/schemas";
import { cite } from "../cite";
import { BankaiFailure } from "../errors";
import { check, type RuleContext } from "./context";

type Durations = "low" | "likely" | "high";

const duration = (a: Activity, d: Durations) =>
  d === "low" ? a.duration_low_days : d === "high" ? a.duration_high_days : a.duration_days;

const invalid = (detail: string) =>
  new BankaiFailure("PROJECT_INVALID", "Schedule is not a valid network", detail);

/** Kahn's algorithm: activities in dependency order. */
function topoOrder(activities: Activity[]): Activity[] {
  const byId = new Map(activities.map((a) => [a.id, a]));
  if (byId.size !== activities.length) {
    const dupes = activities.filter((a, i) => activities.findIndex((b) => b.id === a.id) !== i);
    throw invalid(
      `schedule.json: duplicate activity id ${[...new Set(dupes.map((a) => a.id))].join(", ")}`,
    );
  }
  const indegree = new Map(activities.map((a) => [a.id, a.predecessors.length]));
  const successors = new Map<string, string[]>();
  for (const a of activities) {
    for (const p of a.predecessors) {
      if (!byId.has(p)) throw invalid(`schedule.json: ${a.id}: unknown predecessor ${p}`);
      successors.set(p, [...(successors.get(p) ?? []), a.id]);
    }
  }
  const ready = activities.filter((a) => a.predecessors.length === 0).map((a) => a.id);
  const order: Activity[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(byId.get(id)!);
    for (const s of successors.get(id) ?? []) {
      indegree.set(s, indegree.get(s)! - 1);
      if (indegree.get(s) === 0) ready.push(s);
    }
  }
  if (order.length !== activities.length) {
    const stuck = activities.filter((a) => !order.includes(a)).map((a) => a.id);
    throw invalid(`schedule.json: dependency cycle among ${stuck.join(", ")}`);
  }
  return order;
}

/** Earliest start and finish in days from project start. `delays` pushes an activity's start back. */
export function forwardPass(
  activities: Activity[],
  durations: Durations = "likely",
  delays: ReadonlyMap<string, number> = new Map(),
): Map<string, { es: number; ef: number }> {
  const out = new Map<string, { es: number; ef: number }>();
  for (const a of topoOrder(activities)) {
    const es = Math.max(0, ...a.predecessors.map((p) => out.get(p)!.ef)) + (delays.get(a.id) ?? 0);
    out.set(a.id, { es, ef: es + duration(a, durations) });
  }
  return out;
}

/** Activities reachable from the starting set through successor links, starting set included. */
function downstream(activities: Activity[], start: Set<string>): Set<string> {
  const reached = new Set(start);
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of activities) {
      if (!reached.has(a.id) && a.predecessors.some((p) => reached.has(p))) {
        reached.add(a.id);
        grew = true;
      }
    }
  }
  return reached;
}

/** How far a delay to this unit's activities pushes the last milestone, as a three-point range (D27). */
export function scheduleImpact(ctx: RuleContext, delay: Range): Check {
  const acts = ctx.project.activities;
  const baseline = forwardPass(acts); // validates the network before any early return
  const own = acts.filter((a) => a.tag !== null && a.tag === ctx.tag);
  if (own.length === 0) return check("schedule_impact", "unknown", "no_activity_for_tag");
  const points = [delay.low, delay.likely, delay.high];
  if (
    !points.every((d) => Number.isFinite(d) && d >= 0) ||
    delay.low > delay.likely ||
    delay.likely > delay.high
  ) {
    return check("schedule_impact", "unknown", "invalid_delay");
  }
  if (delay.high === 0)
    return check(
      "schedule_impact",
      "pass",
      "no_delay",
      own.map((a) => cite.activity(a.id)),
    );
  const milestone = acts
    .filter((a) => a.milestone)
    .sort((a, b) => baseline.get(b.id)!.ef - baseline.get(a.id)!.ef)[0];
  if (!milestone) return check("schedule_impact", "unknown", "no_milestone");
  const base = baseline.get(milestone.id)!.ef;

  const ownIds = new Set(own.map((a) => a.id));
  const entries = own.filter((a) => !a.predecessors.some((p) => ownIds.has(p)));
  const slip = (d: Durations, days: number) => {
    // Delay only the unit's first activities; the pass carries it down the chain once.
    const delays = new Map(entries.map((a) => [a.id, days]));
    return Math.max(0, forwardPass(acts, d, delays).get(milestone.id)!.ef - base);
  };
  const range: Range = {
    low: slip("low", delay.low),
    likely: slip("likely", delay.likely),
    high: slip("high", delay.high),
    unit: "days",
  };

  const affected = downstream(acts, new Set(own.map((a) => a.id)));
  const blocked = affected.size - own.length;
  const reason = `${blocked} activities blocked; ${milestone.name} slips ${range.likely} days (range ${range.low} to ${range.high})`;
  const citations = acts.filter((a) => affected.has(a.id)).map((a) => cite.activity(a.id));
  return {
    ...check(
      "schedule_impact",
      range.likely > 0 || range.high > 0 ? "fail" : "pass",
      reason,
      citations,
    ),
    range,
  };
}
