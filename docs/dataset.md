# How to build the dataset

Bankai is scored on a dataset the team builds by hand: a fake data center, photos of real equipment, and the answer keys. The dataset is the proof that Bankai works, so every label comes from the plate or the project files, never from what Bankai outputs.

## Why the dataset comes first

Without an answer key, “accuracy” is a guess. Labels and scenarios let `bankai eval` report a measured number, and the blind set stops the team from tuning rules to its own tests.

## The five pieces

| Piece | Target size |
|---|---|
| Project Alpha files | 6 files, about 40 tags |
| Nameplate photos | About 150 |
| Verification scenarios | About 60 |
| Voice notes | About 30 |
| Blind set | 20 |

## 1. Project Alpha, the fake world

Project Alpha is a synthetic 12 MW data center in Navi Mumbai. Bankai checks every photo against these files. No files means nothing to link to.

Fill the six structured exports (CSV or JSON, not PDFs):

| File | Holds |
|---|---|
| `equipment_schedule.csv` | ~40 tags (GEN, TX, SWGR, UPS, PDU, CRAH, CH, ATS) with designed location, ratings, drawing and revision |
| `drawings.csv` | Drawing register, revisions, superseded flags and dates |
| `purchase_orders.json` | PO lines per tag with component lists, qty, ratings |
| `submittals.json` | Approved products, status, allowed deviations |
| `schedule.json` | Activities, dependencies, best / likely / worst durations |
| `deliveries.json` | Delivery tickets and BOL lines; drivers as `DRV-17`, never names |

Templates live in `data/templates/`. A schema validator in CI rejects malformed files.

Plant traps on purpose:

- A drawing revision that moves a generator
- A PO component that never arrives (partial shipment)
- An unapproved substitute on site
- A unit that is not in the project at all

Without traps, every case is “correct” and the AI can pass by always saying yes.

Privacy rules still apply: role and device IDs only (`SUPT-01`, `DRV-17`), synthetic data labelled as synthetic, no real client data.

## 2. Photos, the input Bankai must read

Photograph campus equipment with a nameplate: diesel generator (DG) sets, transformers, electrical panels and switchboards, UPS units, air handling units (AHUs), chillers, pumps.

For each piece of equipment, take:

1. The whole unit (shows what and where)
2. The nameplate straight on, sharp and readable
3. The nameplate at an angle
4. One hard shot: glare, shadow, or a little blur (some failures on purpose)
5. Any painted tag or label on the unit (like “DG-2”)

Rules:

- No people in the frame, no faces, no screens with names
- Phone camera is fine; do not climb or open anything
- Strip EXIF (GPS, device, time) with `just strip-exif` before commit; CI fails on any photo that still has an EXIF segment

Label each nameplate exactly as printed:

- Manufacturer, model, serial
- Ratings: voltage, kVA or kW, phase, frequency
- `unreadable` when you cannot read a field

Never guess a value. `unreadable` is a valid label: it tests that Bankai asks for a retake or hands off instead of guessing.

Use the `label-photo` skill. File format: `data-format.md`.

## 3. Verification scenarios, the verdict key

Each scenario is one exam question:

- **Input:** photo or photos, location (room or pad), Project Alpha state at that moment
- **Expect:** status (`confirmed`, `flagged`, `needs_human`), which checks pass or fail, and the citations the answer must carry

Example: photo of a generator on Pad B, PO says Cat 3516, photo nameplate says Cummins C2000, no matching submittal. Expect a substitution failure, cited to the PO line, submittal (or its absence), and the photo region.

Build about 60 scenarios, balanced across:

| Kind | What it tests |
|---|---|
| Correct install | Happy path |
| Wrong location | Location check |
| Superseded revision | Matches an old drawing revision |
| Spec mismatch | Nameplate ratings vs PO |
| Partial shipment | Completeness (for example controls cabinet missing) |
| Unapproved substitute | Substitution check |
| Unreadable nameplate | Retake request, not a guess |
| Not in project | Must flag; never invent a record |

Use the `make-scenario` skill. CI checks format. The “not in project” cases prove fabrication rate stays at 0.

## 4. Voice notes, the ears

Write about 30 scripts (“GEN-3 landed on pad B, controls cabinet missing”), turn them into audio with the `generate-voice-note` skill (synthetic voices only, rotate the six Groq voices), and write the expected claims for each. Format: `docs/data-format.md`, "Voice notes".

## 5. Blind set, the anti-cheat

Write 20 test cases without reading the rules code. If accuracy collapses on blind cases, the rules were tuned to the team’s own tests. The blind set stands in for the unseen examples Bankai will meet in practice.

## Splits and metrics

Split labelled data three ways:

- **Calibration:** fit the calibrator (when to be confident)
- **Held-out test:** report accuracy here; never tune rules on this split
- **Blind:** scored once at the end

`bankai eval` reports:

- Field accuracy (nameplate reading)
- Verdict accuracy (scenario status)
- Selective accuracy vs coverage (of cases answered, how often right; how many handed to a human)
- Fabrication rate (must be 0)
- Calibration error, cost, and latency per run

## Rules that never bend

- **Citation or drop:** any value without a citation is removed before output
- **No real people:** no faces, names, GPS, or device identity in photos or audio; synthetic voices only for test audio
- **Never invent:** vendors, products, model numbers, and sources; “not in project” must flag
- **`unreadable` is success:** it drives retake and abstain, not a guessed field
- **Honest numbers:** every accuracy figure shown is what `bankai eval` measured
