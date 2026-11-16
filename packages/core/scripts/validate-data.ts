import { BankaiFailure } from "../src/errors";
import { loadProject } from "../src/project/load";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: validate-data <project dir>");
  process.exit(2);
}

try {
  const p = await loadProject(dir);
  const rows =
    p.equipment.length +
    p.drawings.length +
    p.poLines.length +
    p.submittals.length +
    p.activities.length +
    p.deliveries.length;
  console.log(`OK ${rows} rows`);
} catch (e) {
  if (!(e instanceof BankaiFailure)) throw e;
  console.error(e.detail ?? e.message);
  process.exit(1);
}
