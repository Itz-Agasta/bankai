# How Bankai works

One core library runs three surfaces: an MCP server, a CLI, and a SKILL.md for coding agents. A phone web app is the fourth entry point. Every answer flows through the same five stages: perceive, link, decide, calibrate, act.

## Principle

The AI perceives, rules decide, a human approves. Models never write records. Rules are pure functions you can unit-test. Writes wait for a person.

## Pipeline

1. **Perceive: photos.** Gemini finds the nameplate, crops it, and re-reads at full resolution. A second model family (via OpenRouter) reads the same crop. Field agreement is trusted; disagreement triggers a targeted third read or a retake request. Validators check voltage sets, plausible ratings, and serial formats. Failing fields become `unknown`, never guessed. Missing required fields become `retake_request { region, why }`.
2. **Perceive: audio.** Groq Whisper transcribes with word timestamps, prompted with project tags. A large language model (LLM) extracts typed claims (`status`, `date_change`, `issue`, `decision`, `action_item`) pinned to time spans. Grounding drops any claim whose key terms (tag, place, activity, day count, component, status verb) are not spoken inside that span. Names the rules can spot (a word before "said", a capitalized word mid-sentence) are replaced with `[name]` before the LLM sees the transcript; the LLM flags any others, and every flagged name becomes `[name]` in the returned transcript and quotes, and is removed from claim text. A name the rules miss does reach the extraction model.
3. **Link.** Normalize tags (`GEN 3`, `G-3`, `Generator 3` become `GEN-3`). Match exact keys first (serial, tag), then OCR-aware fuzzy distance for model numbers (O/0, I/1, S/5, B/8, Z/2 cost less; other substitutions cost more). Score candidates, keep top-1 vs top-2 margin. An LLM tie-break runs only on thin margin and must pick a listed candidate or “none”.
4. **Decide.** Pure rules: identity, spec, substitution, location, revision, completeness, schedule impact. Schedule impact is a range from three-point durations (best / likely / worst), not a single guess.
5. **Calibrate.** Features (model agreement, validators, link score and margin, rule certainty) feed a logistic calibrator and a conformal threshold at target risk 5% among answered cases. Output status: `confirmed`, `flagged`, or `needs_human`.
6. **Act.** Proposed updates only. `apply_update` requires approval (MCP elicitation or Approve button in the app). Idempotency keys. Append-only audit log. Identity is a role or device ID, never a name.

## Surfaces

### MCP tools (5)

| Tool | Returns |
|---|---|
| `verify_equipment(photos[], location?)` | Verdict |
| `check_delivery(photos[], po_id, ticket_lines?)` | Verdict (completeness focus) |
| `process_site_note(audio)` | NoteRun: NoteResult (claims and proposed updates, each with confidence; models, cost, latency), the redacted transcript, and claims dropped by grounding |
| `apply_update(update_id)` | The only write; needs human approval |
| `explain(verdict_id \| update_id)` | Full evidence trail and trace |

Results are compact JSON. Evidence comes on demand. Every result validates against its zod schema.

### CLI

`bankai verify | delivery | note | explain | apply | init | eval`. Built with `bun build --compile` into a single binary. `bankai init <dir>` loads a project in the documented format.

### Phone web app

React mobile web app: capture photos or audio, pick a room (or scan a door QR; no GPS), see the result card, open evidence, approve or reject proposed updates, request a retake.

### SKILL.md

Teaches a coding agent the workflow: verify on arrival, check completeness, process the walk note, propose and get approval, hand off when unsure.

## Memory and trace

- **Memory.** A `bun:sqlite` store at `.bankai/state.db` keeps verdicts, open items, and pending proposals across restarts. `bankai status` and the MCP tools read it.
- **Trace.** Every pipeline step writes a trace event (step, input hash, summary, model, ms, usd). `explain` returns it.
- **Replay.** `BANKAI_REPLAY=1` answers only from a committed response cache so `bankai demo` runs Project Alpha with no API keys.

## Project data

Inputs are structured exports, not PDFs: equipment schedule, drawings register, purchase orders, submittals, schedule, deliveries. Sample project: Project Alpha, a synthetic 12 MW data center in Navi Mumbai. Templates and a format doc ship in `data/templates/` so anyone can load their own project.

Photos are stripped of EXIF (GPS, device, time) on ingest and upload. CI fails on any photo that still has an EXIF segment.

## Evaluation

Roughly 150 nameplate photos, 60 verification scenarios, 30 text-to-speech (TTS) voice notes, and a 20-case blind set. Splits: calibration, held-out test, blind. Metrics include field accuracy, verdict accuracy, selective accuracy vs coverage, fabrication rate (must be 0), calibration error, cost, and latency per run. `bankai eval` writes `EVAL_REPORT.md` and runs in CI on every pull request.
