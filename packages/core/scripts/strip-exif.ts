import { hasMetadata, stripMetadata } from "../src/perceive/exif";
import { isPhoto, listFiles } from "./photos";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: strip-exif <dir>");
  process.exit(2);
}

// Only touch files that still carry metadata: re-encoding a clean JPEG again loses detail each time.
let n = 0;
for (const path of (await listFiles(dir)).filter(isPhoto)) {
  const bytes = await Bun.file(path).bytes();
  if (!hasMetadata(bytes)) continue;
  await Bun.write(path, await stripMetadata(bytes));
  n++;
}
console.log(`stripped ${n}`);
