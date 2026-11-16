# Data format

The exact shape of every file Bankai reads. CI rejects anything that does not match. Check locally before you push:

```bash
just validate-data data/fixtures/mini    # project files (use data/projects/alpha once it exists)
just validate-eval                       # labels, scenarios, photos
```

## Project files

One folder per project under `data/projects/<name>/`. Six files, all required. Empty starters live in `data/templates/`. A small complete example is `data/fixtures/mini/`.

Write tags, locations and drawing numbers in upper case with a hyphen: `GEN-3`, `PAD-B`, `E-201`.

### `equipment_schedule.csv`

One row per tag per drawing revision. Keep the old row when a revision moves a unit: that is how the superseded revision check works.

| Column | Example | Notes |
|---|---|---|
| `tag` | `GEN-3` | |
| `type` | `generator` | |
| `location` | `PAD-B` | Designed location on that revision |
| `manufacturer` | `Cummins` | |
| `model` | `C2000D6` | |
| `voltage` | `415` | Text, so `415/240` is fine |
| `kva` | `2000` | Number, or empty |
| `kw` | | Number, or empty |
| `phase` | `3` | Number |
| `frequency` | `50` | Number |
| `drawing` | `E-201` | Must exist in `drawings.csv` |
| `revision` | `C` | Must exist in `drawings.csv` for that drawing |

Only one row per tag may sit on the current revision of its drawing.

### `drawings.csv`

| Column | Example | Notes |
|---|---|---|
| `drawing` | `E-201` | |
| `revision` | `B` | |
| `issued` | `2026-08-10` | `YYYY-MM-DD` |
| `superseded_by` | `C` | Empty on the current revision |
| `superseded_on` | `2026-10-02` | Empty on the current revision |

Each drawing has exactly one current revision. `superseded_by` and `superseded_on` are both filled or both empty, and `superseded_by` must name another revision of the same drawing.

### JSON files

Each is a JSON array of rows.

`purchase_orders.json`, one row per PO line:

```json
{ "po": "PO-1042", "line": 14, "tag": "GEN-3", "manufacturer": "Cummins", "model": "C2000D6",
  "voltage": "415", "kva": 2000, "kw": null, "components": ["generator", "controls cabinet", "day tank"], "qty": 1 }
```

`submittals.json`, one row per tag (a submittal covering two tags is two rows with the same `id`). `status` is `approved`, `approved_as_noted`, `rejected` or `pending`:

```json
{ "id": "SUB-07", "tag": "GEN-3", "manufacturer": "Cummins", "model": "C2000D6", "status": "approved", "deviations": [] }
```

`schedule.json`, one row per activity. Durations are in days and must satisfy low <= likely <= high. `tag` is set on the activity a site event drives (setting the unit); later activities link through `predecessors`:

```json
{ "id": "A10", "name": "Set GEN-3", "tag": "GEN-3", "duration_days": 2, "duration_low_days": 1,
  "duration_high_days": 3, "predecessors": [], "milestone": false }
```

`deliveries.json`, one row per ticket line. `driver_id` is a role ID like `DRV-17`, never a name:

```json
{ "ticket": "DT-88", "line": 1, "po": "PO-1042", "tag": "GEN-3", "item": "generator", "qty": 1, "driver_id": "DRV-17" }
```

## Photos

`eval/photos/`, JPEG or PNG only. No people, no faces, no screens with names. Run `just strip-exif eval/photos` before every commit; it rewrites only photos that still carry EXIF, XMP or IPTC. CI fails on any photo with that metadata. Name files `<tag or unit>-<view>.<jpg|jpeg|png>`, lower case, for example `gen-3-plate-front.jpg`.

## Photo labels

`eval/labels/<photo name without extension>.json`, one per photo. Template: `eval/labels/_template.json`.

| Key | Meaning |
|---|---|
| `photo` | File name inside `eval/photos/`, no folders |
| `equipment_type` | `generator`, `transformer`, `panel`, `ups`, `ahu`, `chiller`, `pump`, ... |
| `fields` | Any of `manufacturer`, `model`, `serial`, `tag`, `voltage`, `kva`, `kw`, `phase`, `frequency`, as printed. Ratings (`voltage`, `kva`, `kw`, `phase`, `frequency`) are the number only, no unit: `415`, `415/240`, `2000`. `just validate-eval` rejects `415 V`. Use `"unreadable"` when you cannot read it. Leave a field out when it is not on the plate. |
| `hard` | `true` for the deliberate glare, shadow or blur shot |
| `people_checked` | Must be `true`: you checked the photo has no people |

Never guess a value. `"unreadable"` is a correct label.

## Scenarios

`eval/scenarios/<id>.json`, one exam question each. Template: `eval/scenarios/_template.json`.

| Key | Meaning |
|---|---|
| `id` | Same as the file name, for example `s001-gen3-wrong-pad` |
| `project` | Folder name under `data/projects/` |
| `photos` | One or more file names inside `eval/photos/` |
| `location` | Where the engineer says the unit is, or `null` |
| `expected.status` | `confirmed`, `flagged` or `needs_human` |
| `expected.subject_tag` | The tag Bankai should identify, or `null` |
| `expected.failing_checks` | Any of `identity`, `spec`, `substitution`, `location`, `revision`, `completeness`, `schedule_impact` |
| `expected.candidates` | Optional: tags Bankai should list when it cannot pick one |
| `kind` | `correct`, `wrong_location`, `superseded_revision`, `spec_mismatch`, `partial_shipment`, `unapproved_substitution`, `unreadable`, `not_in_project` |
