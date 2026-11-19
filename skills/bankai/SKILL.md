---
name: bankai
description: Verify data center equipment on site against the project's records. Use when a site engineer sends photos of equipment that arrived or was installed, asks whether a delivery is complete, sends a spoken site walk note, wants a record update approved, or asks why Bankai reached a verdict.
---

# Bankai

Bankai checks what is on site against the project's purchase orders, submittals, current drawing revisions and schedule. It returns a verdict with a citation for every claim and proposes record updates that a person approves.

## Which tool, when

1. **`verify_equipment`** when equipment arrives or is set in place. Send 1 to 6 photos of one unit: the nameplate, the whole unit, the painted tag. Pass `location` (as written on the drawings, e.g. `PAD-B`) when the person says where it stands; without it Bankai cannot propose an install update.
2. **`check_delivery`** when a delivery lands. Pass the PO number, the line when the PO has several, and the delivery ticket if known. Photos of what arrived are optional and help count parts the ticket missed.
3. **`process_site_note`** when the person sends a spoken walk note (wav, mp3, m4a, ogg, webm or flac). See "Walk notes" below.
4. **`apply_update`** only after a person has seen the proposed update and given their role id (like `SUPT-01`). Never a name. Never call it on your own initiative or to "save time".
5. **`explain`** before disputing or overriding a verdict, or when the person asks why. It shows every step, model, latency and cost.

## Reading a verdict

- `confirmed`: every check that could be judged passed and confidence cleared the threshold.
- `flagged`: a rule failed. Read the failing check's `reason` and its citations to the person as they are.
- `needs_human`: Bankai is not sure. Say so plainly. If `retake_request` is set, ask for that photo (for example the painted tag of an identical twin unit). Otherwise hand it to the site lead.

A check marked `unknown` was not judged. Do not present it as a pass.

`install_readiness` says whether the unit can go in, not only whether it arrived:

- `ready`: identity, spec, substitution, location, revision and completeness all passed.
- `blocked`: one of them failed and the verdict is not `needs_human`. `blockers` names which, for example a right unit on the wrong pad is blocked on `location` until it is moved.
- `unknown`: the verdict is `needs_human` (even if a check failed), or none failed but at least one was not judged. A delivery check judges only completeness, so a complete delivery is still `unknown`. Never call it ready.

## Walk notes

`process_site_note` returns claims (status, delay, issue, decision, action item). Each claim has a time span in the audio (`note.wav@41.2-44.8`) and the words spoken there (`quote`).

- Show each claim with its time span and quote, then its proposed update if there is one.
- Ask the person to approve each update separately with `apply_update`. Never approve a batch on their behalf.
- `needs_human` on a note means it could not be settled: no speech or a model outage; a claim the recording did not support (see `dropped`); an unknown tag, activity or place; a calendar date with no number of days; a unit that was not named; a span that names several units; a negated statement ("not set yet"); or low confidence. Say which, and hand it to the site lead.
- `flagged` means a claim conflicts with the records (for example a unit set on a pad from a superseded drawing). Read the failing check to the person.
- Claims in `dropped` were not supported by the recording. Never repeat them as facts.
- Speakers' names are removed from the transcript and show as `[name]`. Do not try to fill them in.

## Rules

- Quote citations exactly. Never invent a vendor, model number, PO, drawing or record that is not in a result.
- Proposed updates are proposals until `apply_update` approves them. Do not tell anyone a record has changed before that.
- Photos must not show people. Use role ids, never names.
- An error result is one line, `CODE: message`. `INPUT_UNSUPPORTED` usually means a bad photo or a path outside the project folder; `NOT_FOUND` means the PO, ticket or id is not in this project; `APPROVAL_REQUIRED` means the person did not approve; `INPUT_TOO_LARGE` means a photo over 20 MB or 50 megapixels, or audio over 25 MB (send a smaller one); `PERCEPTION_UNAVAILABLE` means the vision or speech models could not be reached or are not configured (try again later, or hand it to a person); `PROJECT_INVALID` means the project files are broken (tell the site lead).
