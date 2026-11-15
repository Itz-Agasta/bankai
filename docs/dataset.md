# How we build the dataset

Bankai is graded on a dataset we build before the AI is finished. You create a fake data center, photograph real equipment, and write the answer keys. Accuracy is 40% of the contest score, so this work is the product’s proof, not paperwork.

## Why the dataset comes first

Judges try the agent on realistic examples. Without an answer key, “accuracy” is a guess. Labels and scenarios let `bankai eval` report a number you can put on the deck. The blind set exists so we cannot tune the rules to our own tests and call that a win.

## The five pieces

| Piece | Size | First deadline |
|---|---|---|
| Project Alpha files | 6 files, ~40 tags | Skeleton Nov 15; full Nov 22 |
| Nameplate photos | ~150 | 40 by Nov 15; 150 by Nov 22 |
| Verification scenarios | ~60 | Nov 22 |
| Voice notes | ~30 | Nov 29 (release valve) |
| Blind set | 20 | Week 3, before Dec 3 freeze |

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
4. One hard shot: glare, shadow, or a little blur (we want some failures on purpose)
5. Any painted tag or label on the unit (like “DG-2”)

Rules:

- No people in the frame, no faces, no screens with names
- Phone camera is fine; do not climb or open anything
- Strip EXIF (GPS, device, time) with `just strip-exif` before commit; CI fails on any photo that still has an EXIF segment

Label each nameplate exactly as printed:

- Manufacturer, model, serial
- Ratings: voltage, kVA or kW, phase, frequency
- `unreadable` when you cannot read a field

Never guess a value. `unreadable` is a valid label: it teaches retake and abstain behavior, which judges reward.

The skill `label-photo` defines the file format when it lands. Until then, keep labels in the format CI expects once schemas land.

Deadlines: first 40 photos by Nov 15; 150 total by Nov 22. Draw detector boxes around nameplates in Week 2 only if the Nov 18 Gemini spot check says crops help.

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

Write about 30 scripts (“GEN-3 landed on pad B, controls cabinet missing”), turn them into audio with `generate-voice-note` (synthetic voices only, varied including Indian English and site noise), and label the expected claims with time spans.

Release valve: if voice is not end to end by Nov 29, it moves to Round 2 and photos ship alone.

## 5. Blind set, the anti-cheat

Write 20 test cases without reading the rules code. If accuracy collapses on blind cases, we overfit our own tests. Judges will also try unseen examples; the blind set is our stand-in for that.

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

Deck line shape, real numbers only: “X% correct on cases it answers, hands Y% to a human, 0 fabricated records, $Z and N s per check.”

## Rules that never bend

- **Citation or drop:** any value without a citation is removed before output
- **No real people:** no faces, names, GPS, or device identity in photos or audio; synthetic voices only for test audio
- **Never invent:** vendors, products, model numbers, and sources; “not in project” must flag
- **`unreadable` is success:** it drives retake and abstain, not a guessed field
- **Honest numbers:** deck, video, and README show what `bankai eval` actually measured
