import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { approve, explain, reject, status, verify } from "../src/actions";
import { buildContext } from "../src/context";
import { cleanup, fakeModels, miniProject, track } from "./helpers";

afterAll(cleanup);

async function setup() {
  const project = await miniProject();
  const ctx = track(await buildContext({ projectDir: project, models: fakeModels() }));
  const r = await verify(ctx, { photos: [join(project, "plate.jpg")], location: "PAD-B" });
  return { ctx, r, id: r.proposed_updates[0]!.id };
}

const code = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return "no throw";
};

describe("actions", () => {
  test("verify saves the verdict and its pending update", async () => {
    const { ctx, r, id } = await setup();
    expect(r.verdict.status).toBe("confirmed");
    expect(ctx.store.getVerdict(r.verdict.id)?.status).toBe("confirmed");
    expect(ctx.store.pendingUpdates().map((u) => u.id)).toEqual([id]);
  });

  test("approve twice is idempotent, reject after approve is refused", async () => {
    const { ctx, id } = await setup();
    expect(approve(ctx, id, "SUPT-01").approval).toBe("approved");
    expect(approve(ctx, id, "SUPT-01").approval).toBe("approved");
    expect(code(() => reject(ctx, id, "SUPT-01"))).toBe("APPROVAL_REQUIRED");
  });

  test("approve with a name is refused", async () => {
    const { ctx, id } = await setup();
    expect(code(() => approve(ctx, id, "Ravi"))).toBe("INPUT_UNSUPPORTED");
    expect(code(() => reject(ctx, id, "Ravi"))).toBe("INPUT_UNSUPPORTED");
  });

  test("reject marks it rejected and it leaves pending", async () => {
    const { ctx, id } = await setup();
    expect(reject(ctx, id, "SUPT-01").approval).toBe("rejected");
    expect(status(ctx).pending_updates).toEqual([]);
    expect(code(() => approve(ctx, id, "SUPT-01"))).toBe("APPROVAL_REQUIRED");
  });

  test("an unknown update id is NOT_FOUND", async () => {
    const { ctx } = await setup();
    expect(code(() => approve(ctx, "upd_nope", "SUPT-01"))).toBe("NOT_FOUND");
    expect(code(() => explain(ctx, "nope"))).toBe("NOT_FOUND");
  });

  test("explain an update shows its verdict and trace", async () => {
    const { ctx, r, id } = await setup();
    const out = explain(ctx, id);
    expect(out.kind).toBe("update");
    expect(out.verdict?.id).toBe(r.verdict.id);
    expect(out.trace.length).toBeGreaterThan(0);
  });

  test("status lists the pending update", async () => {
    const { ctx, id } = await setup();
    expect(status(ctx).pending_updates.map((u) => u.id)).toEqual([id]);
    expect(Array.isArray(status(ctx).open_items)).toBe(true);
  });
});
