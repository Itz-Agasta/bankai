#!/usr/bin/env bun
import { VERSION } from "@bankai/core";
import { Command } from "commander";
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

await program.parseAsync();
