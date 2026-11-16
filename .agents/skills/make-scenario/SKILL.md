---
name: make-scenario
description: Write one verification scenario (photos, location, project state, expected verdict) for the eval set, validate it and open a PR. Use when asked to add a scenario, test case or exam question for Bankai.
---

# Make a verification scenario

A scenario is one exam question: given these photos and this location, against this project, what should Bankai answer?

## Steps

1. Pick the `kind` that is most under-represented: count files in `eval/scenarios/` by `kind`. Aim for an even mix of `correct`, `wrong_location`, `superseded_revision`, `spec_mismatch`, `partial_shipment`, `unapproved_substitution`, `unreadable`, `not_in_project`.
2. Pick photos that already have labels in `eval/labels/`. If the scenario needs a new photo, use the `label-photo` skill first.
3. Read the project files in `data/projects/<project>/` and work out the right answer from them, not from what you expect Bankai to do:
   - `correct`: tag, ratings and location all match the current revision. Status `confirmed`, no failing checks.
   - `wrong_location`: unit is real but `location` differs from its current-revision row. Failing `location`.
   - `superseded_revision`: `location` matches an older revision row. Failing `location` and `revision`.
   - `spec_mismatch`: plate ratings differ from the PO line. Failing `spec`.
   - `partial_shipment`: a PO component has no delivery line. Failing `completeness`.
   - `unapproved_substitution`: plate maker or model is not on an approved submittal. Failing `substitution`.
   - `unreadable`: plate cannot be read. Status `needs_human`, `subject_tag` null.
   - `not_in_project`: unit matches no record. Status `flagged` or `needs_human`, `subject_tag` null. Bankai must never invent a match.
   - Two identical units and nothing tells them apart: status `needs_human`, list both in `expected.candidates`.
4. If the project data does not contain the trap you need (an old revision row, a missing delivery line, a rejected submittal), add it to the project files first and run `just validate-data data/projects/<project>`.
5. Copy `eval/scenarios/_template.json` to `eval/scenarios/<id>.json`. Use the next free number: `s042-<short-description>`. The `id` must equal the file name.
6. Run `just validate-eval`. Fix every line it prints until it says `OK`.
7. Commit on a branch (`data/<short-name>`), push, and open a PR with `gh pr create`. In the body, say in one line why the expected answer is right, citing the project rows.

Never tune a scenario to what the code currently outputs. The answer comes from the project files.

File format: `docs/data-format.md`.
