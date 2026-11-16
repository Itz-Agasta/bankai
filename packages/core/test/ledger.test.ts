import { afterAll, describe, expect, test } from "bun:test";
import { VerifyResult, type ProposedUpdate, type Verdict } from "@bankai/schemas";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAudit, auditPath, BankaiFailure, openStore } from "../src";

const temps: string[] = [];
afterAll(() => Promise.all(temps.map((d) => rm(d, { recursive: true, force: true }))));
async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "bankai-ledger-"));
  temps.push(dir);
  return dir;
}

const update = (id = "u1"): ProposedUpdate => ({
  id,
  target: { kind: "equipment_schedule_row", ref: "equipment_schedule.csv#GEN-3" },
  field: "install_status",
  old: "",
  new: "installed at PAD-B",
  evidence: [{ kind: "drawing", ref: "E-201@revC" }],
  confidence: 0.9,
  approval: "pending",
  approved_by: null,
  at: null,
});

const lines = (path: string) =>
  existsSync(path)
    ? readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

async function setup() {
  const dir = await tempDir();
  const store = openStore(join(dir, "state.db"));
  const audit = join(dir, "audit.jsonl");
  store.saveUpdates("v1", [update()], audit);
  return { dir, store, audit };
}

const AT = "2026-11-20T11:00:00Z";

describe("ledger", () => {
  test("saving an update makes it pending and writes one proposed line", async () => {
    const { store, audit } = await setup();
    expect(store.pendingUpdates().map((u) => u.id)).toEqual(["u1"]);
    const log = lines(audit);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actor: "bankai",
      action: "proposed",
      update_id: "u1",
      new: "installed at PAD-B",
    });
  });

  test("approve records the role id; a replay returns the same record and writes nothing", async () => {
    const { store, audit } = await setup();
    const first = store.approveUpdate("u1", "SUPT-01", AT, audit);
    expect(first).toMatchObject({ approval: "approved", approved_by: "SUPT-01", at: AT });
    const again = store.approveUpdate("u1", "SUPT-01", "2026-11-20T12:00:00Z", audit);
    expect(again).toEqual(first);
    expect(lines(audit).map((l) => l.action)).toEqual(["proposed", "approved"]);
    expect(store.pendingUpdates()).toEqual([]);
  });

  test("a name instead of a role id is refused", async () => {
    const { store, audit } = await setup();
    expect(() => store.approveUpdate("u1", "Agasta", AT, audit)).toThrow();
    expect(store.getUpdate("u1")?.approval).toBe("pending");
  });

  test("unknown id throws NOT_FOUND", async () => {
    const { store, audit } = await setup();
    try {
      store.approveUpdate("nope", "SUPT-01", AT, audit);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(BankaiFailure);
      expect((e as BankaiFailure).code).toBe("NOT_FOUND");
    }
  });

  test("decline keeps the update pending and logs declined", async () => {
    const { store, audit } = await setup();
    store.declineUpdate("u1", "SUPT-01", AT, audit);
    expect(store.getUpdate("u1")?.approval).toBe("pending");
    expect(lines(audit).map((l) => l.action)).toEqual(["proposed", "declined"]);
  });

  test("a failed audit append rolls the approval back", async () => {
    const { dir, store } = await setup();
    const blocker = join(dir, "not-a-dir");
    writeFileSync(blocker, "");
    expect(() => store.approveUpdate("u1", "SUPT-01", AT, join(blocker, "audit.jsonl"))).toThrow();
    expect(store.getUpdate("u1")).toMatchObject({ approval: "pending", approved_by: null });
  });

  test("appendAudit and auditPath", async () => {
    const dir = await tempDir();
    expect(auditPath(dir)).toBe(join(dir, ".bankai", "audit.jsonl"));
    const file = join(dir, "a.jsonl");
    const u = update();
    appendAudit(file, {
      at: AT,
      actor: "bankai",
      action: "proposed",
      update_id: u.id,
      target: u.target,
      field: u.field,
      old: u.old,
      new: u.new,
      evidence: u.evidence,
    });
    expect(lines(file)).toHaveLength(1);
  });

  test("VerifyResult accepts a verdict with no proposals", () => {
    const verdict: Verdict = {
      id: "v1",
      subject_tag: "GEN-3",
      status: "needs_human",
      checks: [],
      confidence: 0.4,
      retake_request: null,
      candidates: [],
      models: ["m"],
      cost_usd: 0,
      latency_ms: 0,
    };
    expect(VerifyResult.safeParse({ verdict, proposed_updates: [] }).success).toBe(true);
  });
});
