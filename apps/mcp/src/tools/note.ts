import { BankaiFailure, loadProject, processNote } from "@bankai/core";
import { NoteRun } from "@bankai/schemas";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { AudioInput, resolveAudio } from "../audio";
import type { ServerContext } from "../context";
import { fail, ok } from "../results";

const Input = z.object({
  audio: AudioInput.describe("One spoken site walk note: wav, mp3, m4a, ogg, webm or flac"),
});

export function registerNote(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "process_site_note",
    {
      title: "Process site note",
      description:
        "Turn a spoken site walk note into claims (status, delays, issues, decisions, action items), each pinned to its time in the audio and linked to the project records, plus proposed record updates that need a person's approval. Unclear notes come back needs_human.",
      inputSchema: Input,
      outputSchema: NoteRun,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ audio }) => {
      try {
        const { speech, extract } = ctx.models;
        if (!speech || !extract)
          throw new BankaiFailure(
            "PERCEPTION_UNAVAILABLE",
            "speech is not configured",
            "set GROQ_API_KEY to process site notes",
          );
        const project = await loadProject(ctx.projectDir);
        const path = await resolveAudio(audio, ctx);
        const run = await processNote(
          { audio: path },
          { project, models: { speech, extract }, tracer: (id) => ctx.store.restartTrace(id) },
        );
        ctx.store.saveNote(run.result, new Date().toISOString());
        return ok(run);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
