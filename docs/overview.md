# What Bankai is

Bankai is the eyes and ears of Kaya’s Amber agent after equipment reaches the site gate. You photograph data center equipment or record a voice note on a site walk. Bankai links what it sees and hears to the project’s purchase orders, approved submittals, current drawing revisions, and schedule, then returns a verdict with a citation for every claim.

## The problem

Kaya’s products stop at “site arrival” / “brought to the pad”. After that, wrong-location installs, superseded drawings in the field, partial shipments, and decisions said out loud never reach the system. Bankai fills that gap.

## Who it is for

Superintendents, field engineers, and project engineers on data center builds. The buyer and consumer is Kaya’s Amber, which calls Bankai over the Model Context Protocol (MCP).

## Pitch line

**You built Amber’s brain. We built its eyes and ears.**

## What Round 1 ships

- Photo verification: nameplate and tag reading, link to records, checks for identity, spec, substitution, location, revision, completeness, schedule impact, retake requests.
- Delivery check: photos and ticket lines vs PO components, partial shipment flag.
- Voice site notes: transcript with timestamps, typed claims, proposed updates a person approves. Voice is the release valve: if it is not end to end by Nov 29, it moves to Round 2.
- MCP server (5 tools), CLI, SKILL.md, mobile web app, eval harness with calibrated abstention.

Out of scope: parsing drawings from images, GPS or person tracking, writing straight into Amber’s records, bid leveling, lead-time prediction, storage lookup.

## How we are judged

Kaya AI Grand Challenge, Edition 2, Track 02 (Contextual Intelligence), Students division. Round 1 closes Sun Dec 6, 23:45 IST. Our submit target: Dec 6, 12:00 IST.

| Criterion | Weight | What judges look for |
|---|---|---|
| Accuracy | 40% | Gets the job right on realistic examples |
| Customer value | 30% | A procurement manager or superintendent would use it tomorrow |
| Trustworthiness | 20% | Sources cited, sensible confidence, nothing made up |
| Build quality | 10% | Documented setup, cost and speed per run, code quality |

“An agent that says ‘not sure, check with a human’ scores better than one that confidently gives a wrong answer.”

## Rules that shape every choice

- **AI perceives, rules decide, a human approves.** Models read photos and audio. Verdicts come from pure, unit-tested rules. A person approves every write.
- **Citation or drop.** Any value without a citation is removed before output. Fabrication rate must stay at 0.
- **Read-only by default.** The only write is `apply_update`, and it needs human approval.
- **Honest numbers.** The deck, video, and README show what `bankai eval` actually measured.
- **Track 02 privacy.** No real people in photos or recordings, no GPS, synthetic voices for test audio, role IDs only (for example `SUPT-01`, never a name).

How we build the test data: `dataset.md`.
