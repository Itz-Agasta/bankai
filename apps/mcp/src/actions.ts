import {
  BankaiFailure,
  checkDelivery,
  loadProject,
  processNote,
  proposeForVerify,
  verifyEquipment,
  type OpenItem,
} from "@bankai/core";
import {
  ActorId,
  NoteResult,
  ProposedUpdate,
  Verdict,
  type NoteRun,
  type VerifyResult,
} from "@bankai/schemas";
import { z } from "zod";
import type { ServerContext } from "./context";

/** Load, run, save: the steps every surface (MCP, HTTP) shares. Paths are already checked. */

export async function verify(
  ctx: ServerContext,
  i: { photos: string[]; location: string | null; components?: string[] },
): Promise<VerifyResult> {
  // Site records change during the day: read them fresh on every call.
  const project = await loadProject(ctx.projectDir);
  const runId = crypto.randomUUID();
  const verdict = await verifyEquipment(
    { photos: i.photos, location: i.location, observedComponents: i.components },
    { project, models: ctx.models, tracer: ctx.store.tracer(runId), runId },
  );
  ctx.store.saveVerdict(verdict, new Date().toISOString());
  const proposed = proposeForVerify(verdict, i.location, project);
  ctx.store.saveUpdates(verdict.id, proposed);
  return { verdict, proposed_updates: proposed };
}

export async function delivery(
  ctx: ServerContext,
  i: { po: string; line?: number; ticket?: string; photos?: string[] },
): Promise<VerifyResult> {
  const project = await loadProject(ctx.projectDir);
  const runId = crypto.randomUUID();
  const result = await checkDelivery(i, {
    project,
    models: ctx.models,
    tracer: ctx.store.tracer(runId),
    runId,
  });
  ctx.store.saveVerdict(result.verdict, new Date().toISOString());
  ctx.store.saveUpdates(result.verdict.id, result.proposed_updates);
  return result;
}

export async function note(ctx: ServerContext, i: { audio: string }): Promise<NoteRun> {
  const { speech, extract } = ctx.models;
  if (!speech || !extract)
    throw new BankaiFailure(
      "PERCEPTION_UNAVAILABLE",
      "speech is not configured",
      "set GROQ_API_KEY to process site notes",
    );
  const project = await loadProject(ctx.projectDir);
  const run = await processNote(
    { audio: i.audio },
    { project, models: { speech, extract }, tracer: (id) => ctx.store.restartTrace(id) },
  );
  ctx.store.saveNote(run.result, new Date().toISOString());
  return run;
}

function actor(by: string): string {
  const r = ActorId.safeParse(by);
  if (!r.success)
    throw new BankaiFailure("INPUT_UNSUPPORTED", "approved_by must be a role id like SUPT-01");
  return r.data;
}

/** The caller's approval is the person's approval (D15). Idempotent. */
export function approve(ctx: ServerContext, id: string, by: string): ProposedUpdate {
  return ctx.store.approveUpdate(id, actor(by), new Date().toISOString());
}

export function reject(ctx: ServerContext, id: string, by: string): ProposedUpdate {
  return ctx.store.rejectUpdate(id, actor(by), new Date().toISOString());
}

export const ExplainOut = z.object({
  kind: z.enum(["verdict", "update", "note"]),
  verdict: Verdict.optional(),
  note: NoteResult.optional(),
  update: ProposedUpdate.optional(),
  trace: z.array(
    z.object({
      step: z.string(),
      input_hash: z.string(),
      summary: z.string(),
      model: z.nullable(z.string()),
      ms: z.number(),
      usd: z.number(),
      at: z.string(),
    }),
  ),
});
export type ExplainOut = z.infer<typeof ExplainOut>;

export function explain(ctx: ServerContext, id: string): ExplainOut {
  const update = ctx.store.getUpdate(id);
  // An update's source is the verdict or note that proposed it.
  const sourceId = update ? ctx.store.verdictOfUpdate(id) : id;
  const verdict = sourceId ? ctx.store.getVerdict(sourceId) : null;
  const note = sourceId && !verdict ? ctx.store.getNote(sourceId) : null;
  if (!update && !verdict && !note)
    throw new BankaiFailure("NOT_FOUND", `no verdict, note or update ${id}`);
  const trace = sourceId
    ? ctx.store.trace(sourceId).map(({ step, input_hash, summary, model, ms, usd, at }) => ({
        step,
        input_hash,
        summary,
        model,
        ms,
        usd,
        at,
      }))
    : [];
  if (update)
    return {
      kind: "update",
      update,
      verdict: verdict ?? undefined,
      note: note ?? undefined,
      trace,
    };
  return verdict ? { kind: "verdict", verdict, trace } : { kind: "note", note: note!, trace };
}

export function status(ctx: ServerContext): {
  open_items: OpenItem[];
  pending_updates: ProposedUpdate[];
} {
  return { open_items: ctx.store.openItems(), pending_updates: ctx.store.pendingUpdates() };
}
