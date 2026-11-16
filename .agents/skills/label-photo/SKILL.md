---
name: label-photo
description: Write the ground-truth label for one nameplate photo in eval/photos, validate it and open a PR. Use when someone adds equipment photos or asks to label a photo.
---

# Label a nameplate photo

One label file per photo. The label is the answer key Bankai is scored against, so it must match the plate exactly.

## Steps

1. Confirm the photo is in `eval/photos/` as `.jpg`, `.jpeg` or `.png`. If not, ask for it. Never accept HEIC; ask the person to export JPEG.
2. Look at the photo. If any person, face or screen with a name is visible, stop and tell the person to retake it. Do not label it.
3. Run `just strip-exif eval/photos`. It only rewrites photos that still carry metadata, so clean photos are left untouched.
4. Copy `eval/labels/_template.json` to `eval/labels/<photo name without extension>.json`. Every value in it is a sample: set `photo` to the file name, set `equipment_type`, and replace or remove every field. No sample value may survive.
5. Fill each field exactly as printed on the plate: same spelling and characters, without the unit suffix or thousands comma (`415`, not `415 V`; `1500`, not `1,500`).
   - Cannot read it with confidence: write `"unreadable"`. Never guess, never "fix" a typo on the plate.
   - Not on the plate at all: remove the key.
   - Ask the person to confirm any field you are unsure about. Their eyes on the real plate beat your read.
6. Set `hard` to `true` only for the deliberate glare, shadow or blur shot. Set `people_checked` to `true` after step 2.
7. Run `just validate-eval`. Fix every line it prints until it says `OK`.
8. Commit the photo and label together on a branch (`data/<short-name>`), push, and open a PR with `gh pr create`. The PR body lists the photos added.

Field list and file format: `docs/data-format.md`.
