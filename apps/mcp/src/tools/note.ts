import { NoteRun } from "@bankai/schemas";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { AudioInput, resolveAudio } from "../audio";
import { note, speechModels } from "../actions";
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
        speechModels(ctx); // refuse before writing base64 audio
        return ok(await note(ctx, { audio: await resolveAudio(audio, ctx) }));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
