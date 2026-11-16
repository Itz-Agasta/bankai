#!/usr/bin/env bun
import { VERSION } from "@bankai/core";
import { Command } from "commander";
import { evalCommand } from "./commands/eval";
import { mcpCommand } from "./commands/mcp";
import { noteCommand } from "./commands/note";
import { serveCommand } from "./commands/serve";
import { statusCommand } from "./commands/status";
import { verifyCommand } from "./commands/verify";

const program = new Command()
  .name("bankai")
  .description("Site equipment verification with cited verdicts")
  .version(VERSION);

program
  .command("verify")
  .description("Check equipment photos against the project records")
  .argument("<photos...>", "photos of one unit (nameplate, whole unit, tag)")
  .requiredOption("--project <dir>", "project folder (see docs/data-format.md)")
  .option("--location <loc>", "where the unit is, e.g. PAD-B")
  .option("--components <list>", "components seen, comma separated")
  .option("--json", "print the Verdict as JSON")
  .action(async (photos: string[], opts) => {
    process.exitCode = await verifyCommand(photos, opts);
  });

program
  .command("note")
  .description("Turn a spoken site walk note into cited claims and proposed updates")
  .argument("<audio>", "the walk note: wav, mp3, m4a, ogg, webm or flac")
  .requiredOption("--project <dir>", "project folder (see docs/data-format.md)")
  .option("--json", "print the NoteRun as JSON")
  .action(async (audio: string, opts) => {
    process.exitCode = await noteCommand(audio, opts);
  });

program
  .command("status")
  .description("List open items (flagged or needing a human), oldest first")
  .requiredOption("--project <dir>", "project folder")
  .option("--json", "print open items as JSON")
  .action(async (opts) => {
    process.exitCode = await statusCommand(opts);
  });

program
  .command("eval")
  .description("Score Bankai on a labelled set and write EVAL_REPORT.md")
  .option("--set <dir>", "set folder with photos/, labels/, scenarios/", "eval")
  .option("--projects <dir>", "folder holding the projects scenarios name", "data/projects")
  .option("--fake", "use <set>/fake-models.json instead of live models")
  .option("--no-crop", "read the whole photo instead of the nameplate crop")
  .option("--out <dir>", "where results.jsonl and EVAL_REPORT.md go", "eval/out")
  .action(async (opts) => {
    process.exitCode = await evalCommand(opts);
  });

program
  .command("mcp")
  .description("Serve the Bankai tools and skill over MCP (stdio)")
  .option("--project <dir>", "project folder (default: $BANKAI_PROJECT)")
  .action(async (opts) => {
    const code = await mcpCommand(opts);
    if (code !== undefined) process.exitCode = code;
  });

program
  .command("serve")
  .description("Serve the JSON API for the phone app over HTTP")
  .option("--project <dir>", "project folder (default: $BANKAI_PROJECT)")
  .option("--port <n>", "port (default: $PORT or 8787)")
  .option("--demo", "replay-only demo on a throwaway copy of the project")
  .action(async (opts) => {
    const code = await serveCommand(opts);
    if (code !== undefined) process.exitCode = code;
  });

await program.parseAsync();
