# What Bankai is

Bankai checks data center equipment once it reaches the site gate, as the eyes and ears of Kaya’s Amber agent. You photograph equipment or record a voice note on a site walk, and Bankai links what it sees and hears to the project’s purchase orders, approved submittals, current drawing revisions and schedule. It returns a verdict with a citation for every claim, or says it needs a human.

## The gap after site arrival

Kaya’s products stop at “site arrival” or “brought to the pad”. After that, these problems never reach the system:

- A unit installed in the wrong place
- A crew working from a superseded drawing
- A partial shipment
- A decision said out loud on a site walk

## Who uses it

Superintendents, field engineers and project engineers on data center builds use it from a phone. Kaya’s Amber calls it over the Model Context Protocol (MCP).

## What it does

Bankai covers three jobs on site:

- **Photo verification**: reads the nameplate and painted tag, links the unit to its records, and checks identity, spec, substitution, location, drawing revision, completeness and schedule impact. It asks for a retake when a photo can’t settle the answer.
- **Delivery check**: compares photos and ticket lines with the purchase order’s components and flags a partial shipment.
- **Voice site notes**: turns a spoken note into timestamped claims (status, delay, issue, decision, action item) and proposes record updates a person approves.

It runs as an MCP server (5 tools), a command line, an HTTP API for the phone app, and a skill for coding agents.

These are out of scope: reading drawings from images, GPS or person tracking, writing straight into Amber’s records, bid leveling, lead-time prediction and storage lookup.

## Rules that shape every choice

Five rules decide how Bankai is built:

- **AI perceives, rules decide, a human approves**: models read photos and audio, verdicts come from pure, unit-tested rules, and a person approves every write
- **Citation or drop**: any value without a citation is removed before output, so the fabrication rate stays at 0
- **Read-only by default**: the only write is `apply_update`, and it needs a person’s approval
- **Honest numbers**: every accuracy figure shown is what `bankai eval` measured
- **Privacy**: no real people in photos or recordings, no GPS, synthetic voices for test audio, and role IDs such as `SUPT-01` instead of names

How the test data is built: [dataset.md](dataset.md). How the pipeline works: [architecture.md](architecture.md).
