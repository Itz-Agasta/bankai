# How Bankai works

One core library serves four entry points: an MCP server, a command line, an HTTP API for the phone app, and a skill for coding agents. A photo check goes through five stages: perceive, link, decide, calibrate, act. A delivery check skips linking and calibration, and a site note adds grounding.

## The principle

The AI perceives, rules decide, a human approves. Models never write records, rules are pure functions you can unit-test, and writes wait for a person.

## Pipeline

Each stage feeds the next:

1. **Perceive photos**: Gemini finds the nameplate, crops it and re-reads it at full resolution, and a second model family (through OpenRouter) reads the same crop. Fields both models agree on are trusted. Validators check voltage sets, plausible ratings and serial formats, and a failing field becomes `unknown`, never a guess. A missing required field becomes a retake request naming the region and why.
2. **Perceive audio**: Groq Whisper transcribes with word timestamps, prompted with the project’s tags. A large language model (LLM) extracts typed claims (`status`, `date_change`, `issue`, `decision`, `action_item`), each pinned to a time span.
3. **Ground claims**: a claim is dropped when its key terms (tag, place, day count, date, component, status verb, and for a delay the activity) aren’t spoken inside its span. Fields the model filled but nobody said are cleared, and the claim is kept.
4. **Remove names**: names the rules can spot become `[name]` before the LLM reads the transcript, and names the LLM flags are removed from the transcript, quotes and claims it returns.
5. **Link**: tags are normalized (`GEN 3`, `G-3` and `Generator 3` become `GEN-3`), then matched on exact keys first and on optical character recognition (OCR) aware distance for model numbers. When units tie, both models re-read only the printed field they differ on, and Bankai links a unit only when exactly one fits.
6. **Decide**: pure rules check identity, spec, substitution, location, revision, completeness and schedule impact. Schedule impact is a range from best, likely and worst durations.
7. **Calibrate**: confidence blends model agreement, link score and margin, and rating coverage. A fitted calibrator with a 5% risk target replaces this blend once the eval set is labelled. The status is `confirmed`, `flagged` or `needs_human`.
8. **Act**: Bankai only proposes updates. A person approves each one, every decision goes to an append-only audit log, and people appear as role IDs.

## Entry points

The MCP server has 5 tools:

| Tool | Input | Returns |
|---|---|---|
| `verify_equipment` | `photos`, `location?`, `components?` | Verdict and proposed updates |
| `check_delivery` | `po`, `line?`, `ticket?`, `photos?` | Verdict on completeness and proposed updates |
| `process_site_note` | `audio` | Claims with time spans, proposed updates, the redacted transcript, and dropped claims |
| `apply_update` | `update_id`, `approved_by` | The approved update (the only write) |
| `explain` | A verdict, note or update id | The stored record and every pipeline step |

The other entry points share the same core:

- **Command line**: `bankai verify`, `note`, `status`, `eval`, `mcp` (stdio MCP) and `serve` (HTTP)
- **HTTP API**: the JSON API the phone app calls, plus MCP over HTTP at `/mcp`. See [web-api.md](web-api.md).
- **Phone web app**: capture photos or audio, pick a room or scan a door QR code, see the result card, open evidence, approve or reject updates
- **Skill**: `skills/bankai/SKILL.md` teaches an agent when to call each tool and how to read the results

## Memory and trace

Bankai keeps state between runs:

- **Memory**: a SQLite store at `.bankai/state.db` keeps verdicts, notes, open items and proposed updates across restarts
- **Trace**: every pipeline step records its input hash, summary, model, latency and cost, and `explain` returns it
- **Replay**: `bankai serve --demo` answers only from recorded model responses, so the demo needs no API keys

## Project data

Bankai reads structured exports, not PDFs: equipment schedule, drawing register, purchase orders, submittals, schedule and deliveries. The sample project, Project Alpha, is a synthetic 12 MW data center in Navi Mumbai. Templates in `data/templates/` and [data-format.md](data-format.md) let anyone load their own project.

Uploaded photos are stored and read without EXIF, XMP or IPTC metadata (GPS, device, time), and CI fails on any eval photo committed with it.

## Evaluation

`bankai eval` scores Bankai on labelled nameplate photos, verification scenarios, synthetic voice notes, and a blind set written without reading the rules. It reports field accuracy, verdict accuracy, accuracy against coverage, fabrication rate, calibration error, and cost and latency per run, and it runs in CI on every pull request.
