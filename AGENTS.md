# Bankai

Bankai checks data center equipment on site. It reads photos and voice notes, links them to the project's purchase orders, submittals, drawings and schedule, and returns a cited verdict or "needs a human". Built for the Kaya AI Grand Challenge, Edition 2. Background: `docs/overview.md`, `docs/architecture.md`.

## Repo map

| Path | What |
|---|---|
| `packages/schemas` | zod schemas shared by everything |
| `packages/core` | Project loader, linking, rules, perception, scripts |
| `apps/cli` | `bankai` command line (`bankai mcp` starts the MCP server, `bankai serve` the HTTP API) |
| `apps/mcp` | MCP server (5 tools) and the HTTP API for the phone app |
| `skills/bankai` | The `bankai` skill the MCP server serves to agents |
| `data/templates` | Empty project files to start from |
| `data/fixtures/mini` | Tiny complete project used by tests |
| `data/projects/` | Eval projects (Project Alpha, being built) |
| `eval/` | Photos, labels, scenarios |
| `docs/` | Overview, architecture, dataset plan, data format, web API |
| `.agents/skills/` | Skills for coding agents |

## Run

```bash
bun install
just test        # unit tests
just types       # type check
just check       # lint and format (rewrites files)
just check-ci    # what CI runs, read only
just validate-data data/fixtures/mini
just validate-eval
```

Bun 1.4.4 and `just` required.

## Working rules

- Branch from `main`, open a PR. CI and the cubic reviewer run on every PR. Merge when green.
- Before pushing: `just check-ci`, `just types`, `just test`, `just validate-eval`, and `just validate-data` on any project you changed.
- **No real people** in photos or audio: no faces, no names, no screens with names. People appear only as role IDs (`DRV-17`, `SUPT-01`).
- **Strip EXIF** from every photo: `just strip-exif eval/photos`. CI fails otherwise.
- **Never guess** a label. `"unreadable"` is a correct answer.

## Skills

- `.agents/skills/label-photo`: label one nameplate photo.
- `.agents/skills/make-scenario`: write one verification scenario.
- `.agents/skills/generate-voice-note`: write one synthetic voice note.

File formats: `docs/data-format.md`. HTTP API for the phone app: `docs/web-api.md`.
