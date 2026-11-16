---
name: bankai
description: Verify data center equipment on site against the project's records. Use when a site engineer sends photos of equipment that arrived or was installed, asks whether a delivery is complete, wants a record update approved, or asks why Bankai reached a verdict.
---

# Bankai

Bankai checks what is on site against the project's purchase orders, submittals, current drawing revisions and schedule. It returns a verdict with a citation for every claim and proposes record updates that a person approves.

## Which tool, when

1. **`verify_equipment`** when equipment arrives or is set in place. Send 1 to 6 photos of one unit: the nameplate, the whole unit, the painted tag. Pass `location` (as written on the drawings, e.g. `PAD-B`) when the person says where it stands; without it Bankai cannot propose an install update.
2. **`check_delivery`** when a delivery lands. Pass the PO number, the line when the PO has several, and the delivery ticket if known. Photos of what arrived are optional and help count parts the ticket missed.
3. **`apply_update`** only after a person has seen the proposed update and given their role id (like `SUPT-01`). Never a name. Never call it on your own initiative or to "save time".
4. **`explain`** before disputing or overriding a verdict, or when the person asks why. It shows every step, model, latency and cost.

## Reading a verdict

- `confirmed`: every check that could be judged passed and confidence cleared the threshold.
- `flagged`: a rule failed. Read the failing check's `reason` and its citations to the person as they are.
- `needs_human`: Bankai is not sure. Say so plainly. If `retake_request` is set, ask for that photo (for example the painted tag of an identical twin unit). Otherwise hand it to the site lead.

A check marked `unknown` was not judged. Do not present it as a pass.

## Rules

- Quote citations exactly. Never invent a vendor, model number, PO, drawing or record that is not in a result.
- Proposed updates are proposals until `apply_update` approves them. Do not tell anyone a record has changed before that.
- Photos must not show people. Use role ids, never names.
- An error result is one line, `CODE: message`. `INPUT_UNSUPPORTED` usually means a bad photo or a path outside the project folder; `NOT_FOUND` means the PO, ticket or id is not in this project; `APPROVAL_REQUIRED` means the person did not approve.
