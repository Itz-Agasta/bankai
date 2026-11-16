import { PhotoLabel, Scenario } from "@bankai/schemas";
import { existsSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { z } from "zod";
import sharp from "sharp";
import { hasMetadata } from "../src/perceive/exif";
import { isPhoto, listFiles } from "./photos";

const ROOT = join(import.meta.dir, "../../..");
const PHOTOS = join(ROOT, "eval/photos");
const errors: string[] = [];
const rel = (p: string) => relative(ROOT, p);

async function check<T>(dir: string, schema: z.ZodType<T>, verify: (file: string, v: T) => void) {
  let n = 0;
  for (const file of await listFiles(join(ROOT, dir))) {
    if (!file.endsWith(".json")) {
      errors.push(`${rel(file)}: only .json files belong here`);
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await Bun.file(file).text());
    } catch (e) {
      errors.push(`${rel(file)}: not valid JSON: ${(e as Error).message}`);
      continue;
    }
    const r = schema.safeParse(raw);
    if (!r.success) {
      const issue = r.error.issues[0];
      errors.push(`${rel(file)}: ${issue?.path.join(".") || "file"}: ${issue?.message}`);
      continue;
    }
    // Templates show the format; their photos and projects need not exist.
    if (basename(file) === "_template.json") continue;
    verify(file, r.data);
    n++;
  }
  return n;
}

// References are bare names inside one folder, so "../" cannot point outside it.
const bareName = (file: string, what: string, name: string) => {
  const ok = name === basename(name) && name !== "." && name !== "..";
  if (!ok) errors.push(`${rel(file)}: ${what} "${name}" must be a plain name, no folders`);
  return ok;
};

const needPhoto = (file: string, photo: string) => {
  if (!bareName(file, "photo", photo)) return;
  if (!existsSync(join(PHOTOS, photo)))
    errors.push(`${rel(file)}: photo eval/photos/${photo} not found`);
};

// Ratings are labelled as the printed number without its unit: "415", "415/240", "2000".
const RATING_FIELDS = ["voltage", "kva", "kw", "phase", "frequency"] as const;
const RATING = /^\d+(\.\d+)?(\/\d+(\.\d+)?)*$/;

const labels = await check("eval/labels", PhotoLabel, (file, l) => {
  needPhoto(file, l.photo);
  for (const f of RATING_FIELDS) {
    const v = l.fields[f];
    if (v !== undefined && v !== "unreadable" && !RATING.test(v)) {
      errors.push(`${rel(file)}: fields.${f} "${v}" must be the number only, without the unit`);
    }
  }
  const stem = l.photo.replace(/\.[^.]+$/, "");
  if (basename(file, ".json") !== stem) errors.push(`${rel(file)}: name the file ${stem}.json`);
});

const scenarios = await check("eval/scenarios", Scenario, (file, s) => {
  s.photos.forEach((p) => needPhoto(file, p));
  if (basename(file, ".json") !== s.id) errors.push(`${rel(file)}: name the file ${s.id}.json`);
  if (bareName(file, "project", s.project) && !existsSync(join(ROOT, "data/projects", s.project))) {
    errors.push(`${rel(file)}: project data/projects/${s.project} not found`);
  }
});

let photos = 0;
for (const file of await listFiles(PHOTOS)) {
  if (!isPhoto(file)) {
    errors.push(`${rel(file)}: not a JPEG or PNG; export it as JPEG`);
  } else {
    const bytes = await Bun.file(file).bytes();
    const format = await sharp(bytes)
      .metadata()
      .then((m) => m.format)
      .catch(() => null);
    if (format !== "jpeg" && format !== "png")
      errors.push(`${rel(file)}: not a readable JPEG or PNG`);
    else if (hasMetadata(bytes))
      errors.push(
        `${rel(file)}: has photo metadata (EXIF, XMP or IPTC), run just strip-exif eval/photos`,
      );
  }
  photos++;
}

if (errors.length) {
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log(`OK ${labels} labels, ${scenarios} scenarios, ${photos} photos`);
