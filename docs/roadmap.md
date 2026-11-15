# Roadmap

Dates are IST. Feature freeze Dec 3, 23:00. Submit Dec 6, 12:00. Own tasks come from GitHub issues; tick your issue when the work merges.

## Week 0: Nov 13-15 (Fri-Sun), kickoff

- [x] Research and design approved
- [ ] API keys: Gemini, OpenRouter, Groq
- [ ] Monorepo scaffold: bun workspaces, justfile, CI
- [ ] `packages/schemas` first version
- [ ] Photo checklist shared; first 40 campus photos
- [ ] Project Alpha skeleton (equipment list, drawings register)
- [ ] Web app skeleton runs on a phone

## Week 1: Nov 16-22, photo pipeline end to end

- [ ] Model adapter with cost/latency meter and hash cache
- [ ] **Nov 18: Gemini spot check on 20 campus photos (crop vs no crop)**
- [ ] Vision: locate, crop, re-read, checker model, validators
- [ ] Link: tag normalization, OCR-aware distance, candidate scoring, tie-break
- [ ] Rules: identity, spec, location
- [ ] `bankai verify` works from the CLI on Project Alpha
- [ ] 150 photos labelled
- [ ] Project Alpha files complete (all 6 files)
- [ ] 60 scenarios written
- [ ] App: capture, room picker, result card (mock data)
- [ ] **Nov 22: first eval baseline in `EVAL_REPORT.md`**

## Week 2: Nov 23-29, full checks, MCP, voice

- [ ] Rules: revision, completeness, substitution
- [ ] Retake requests
- [ ] Calibrator and conformal threshold
- [ ] MCP server: 5 tools with output schemas
- [ ] **Nov 25: photo pipeline done**
- [ ] Nameplate detector boxes labelled and trained (if spot check says crops help)
- [ ] Voice: transcript with timestamps, claims, grounding, proposed updates
- [ ] 30 voice scripts, TTS audio, labels
- [ ] App: evidence view, retake screen, voice capture
- [ ] Eval runs in CI on every PR
- [ ] **Nov 29: voice end to end (else move voice to Round 2)**

## Week 3: Nov 30 to Dec 3, accuracy grind

- [ ] Fix failing eval cases, one by one
- [ ] Schedule impact (CPM forward pass)
- [ ] Approval flow (`apply_update`), audit log
- [ ] `check_delivery` partial shipment
- [ ] `SKILL.md`
- [ ] Single binary
- [ ] Blind set (20 cases) scored
- [ ] Hosted demo: web app plus remote MCP with Project Alpha preloaded
- [ ] README: setup, run, models, cost and latency per run, data sources
- [ ] **Dec 3, 23:00: feature freeze**

## Dec 4-6, ship

- [ ] Demo video recorded (Dec 4)
- [ ] Deck, 8-10 slides (Dec 4-5)
- [ ] Fresh-machine install test passes (Dec 5)
- [ ] Final eval numbers copied into README, deck, and video
- [ ] Repo public (after IP terms check)
- [ ] **Devpost submission done (Dec 6, 12:00)**

## Round 2: Dec 12-17 (if top 10)

- [ ] Offline mode: fine-tuned small VLM on synthetic nameplates, local server
- [ ] Same eval, offline vs cloud comparison
- [ ] Walkthrough video input
- [ ] Finale demo rehearsed
