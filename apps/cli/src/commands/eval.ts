import {
  fakeModelsFor,
  liveModels,
  loadUserEnv,
  modelConfig,
  renderReport,
  runEval,
} from "@bankai/core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface EvalOptions {
  set: string;
  projects: string;
  fake?: boolean;
  crop: boolean; // commander: --no-crop sets this false
  out: string;
}

/** Score a set; exit 1 if anything was fabricated, so CI fails on an invented record. */
export async function evalCommand(opts: EvalOptions): Promise<number> {
  await loadUserEnv();
  let models;
  if (opts.fake) models = await fakeModelsFor(opts.set);
  else {
    const live = liveModels(modelConfig());
    models = () => live;
  }
  const result = await runEval({
    set: opts.set,
    projectRoot: opts.projects,
    models,
    noCrop: !opts.crop,
  });

  await mkdir(opts.out, { recursive: true });
  const lines = result.cases.map((c) =>
    JSON.stringify({
      id: c.id,
      kind: c.kind,
      correct: c.correct,
      expected: c.expected,
      actual: c.actual,
    }),
  );
  await Bun.write(join(opts.out, "results.jsonl"), `${lines.join("\n")}\n`);
  const report = renderReport(result, { set: opts.set });
  await Bun.write(join(opts.out, "EVAL_REPORT.md"), report);
  console.log(report);
  return result.fabricated > 0 ? 1 : 0;
}
