import { stripMetadata } from "../src/perceive/exif";
import { isPhoto, listFiles } from "./photos";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: strip-exif <dir>");
  process.exit(2);
}

let n = 0;
for (const path of (await listFiles(dir)).filter(isPhoto)) {
  await Bun.write(path, await stripMetadata(await Bun.file(path).bytes()));
  n++;
}
console.log(`stripped ${n}`);
