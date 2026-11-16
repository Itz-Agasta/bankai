# Web API

`bankai serve` runs one HTTP server for the phone app and the hosted demo. It calls the same core as the CLI and the stdio MCP server, and also serves MCP over HTTP at `/mcp`.

## Run

```bash
bun apps/cli/src/main.ts serve --project data/fixtures/mini            # http://localhost:8787
bun apps/cli/src/main.ts serve --project data/fixtures/mini --demo     # replay only, throwaway copy
```

| Env | Meaning |
|---|---|
| `BANKAI_PROJECT` | Project folder when `--project` is not given |
| `PORT` | Port when `--port` is not given (default 8787) |
| `BANKAI_ALLOWED_ORIGINS` | Comma separated hostnames a browser may call from, e.g. `localhost,bankai-demo.fly.dev` |
| `BANKAI_DEMO=1` | Same as `--demo` |
| `BANKAI_CACHE_DIR` | Response cache; in demo mode the replay cache (default `data/replay`) |
| `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY` | Live models (not needed in demo mode) |

## Routes

Types are the zod schemas in `@bankai/schemas`; import them from the monorepo.

| Method, path | Body | Returns |
|---|---|---|
| `GET /api/health` | | `{ ok: true, version, demo, replay, project }` |
| `GET /api/project` | | `{ name, locations[], tags[], po_lines: { po, line, tag, components }[], activities: { id, name, tag }[] }` |
| `POST /api/verify` | multipart: `photos` (1 to 6 files), `location?`, `components?` (comma separated) | `VerifyResult` |
| `POST /api/delivery` | multipart: `po`, `line?`, `ticket?`, `photos?` (0 to 6 files) | `VerifyResult` |
| `POST /api/notes` | multipart: `audio` (one file: wav, mp3, m4a, ogg, webm or flac) | `NoteRun` |
| `POST /api/updates/:id/approve` | JSON `{ approved_by: "SUPT-01" }` | `ProposedUpdate` (approved) |
| `POST /api/updates/:id/reject` | JSON `{ approved_by: "SUPT-01" }` | `ProposedUpdate` (rejected) |
| `GET /api/explain/:id` | | `{ kind: "verdict" \| "note" \| "update", verdict?, note?, update?, trace[] }` |
| `GET /api/status` | | `{ open_items, pending_updates: ProposedUpdate[] }` |
| `GET /api/evidence?kind=<kind>&ref=<ref>` | | `{ citation, record }`, the cited project row |
| `GET /api/uploads/:name` | | An uploaded photo or audio file |
| `POST /api/demo/reset` | | `{ ok: true }` (demo mode only, else 404) |
| `/mcp` | MCP | MCP over streamable HTTP, the same 5 tools as stdio |

Notes for the app:

- Only uploads are read. File names and any `path` field from the client are ignored. Each upload is stored as `<sha256>.<ext>`, and that name is what citations show.
- `approved_by` is a role id (`^[A-Z]{2,5}-\d{1,4}$`), never a person's name. Tapping Approve is the approval.
- Approving twice returns the first approval. Rejecting is final: approving a rejected update is 409.
- Evidence records by kind: `equipment_schedule_row` gives the current row, `po_line` the PO line, `drawing` (`E-201@revC`) the revision, `schedule_activity` the activity, `delivery_line` the ticket line, `submittal` every row under that submittal id (an array), `decision` / `action_item` the row or `null` for a proposed new one, `photo_region` / `audio_span` `{ file, region }` (load the file from `/api/uploads/:file`).

## Errors

Body `{ error: { code, message, detail? } }` (`BankaiError`).

| Code | Status |
|---|---|
| `INPUT_UNSUPPORTED` | 400 |
| `INPUT_TOO_LARGE` | 413 |
| `NOT_FOUND` | 404 |
| `APPROVAL_REQUIRED` | 409 |
| `PERCEPTION_UNAVAILABLE` | 503 |
| `PROJECT_INVALID` | 500 |
| `INTERNAL` | 500, no details |

Requests over 64 MB are refused by Bun itself with a plain (not JSON) 413. Core also caps each photo at 20 MB and each audio file at 25 MB.

## CORS

A request whose `Origin` hostname is in `BANKAI_ALLOWED_ORIGINS` gets `Access-Control-Allow-Origin` back; preflights answer 204. Other origins get no CORS headers on `/api` (the browser blocks the read) and 403 on `/mcp`. Requests without an `Origin` (curl, desktop MCP clients) pass. This is not auth: a live (non-replay) public deployment needs a key gate.

## Demo mode

`--demo` copies the project to a temp folder (the original is never written) and answers model calls only from the replay cache, so it costs nothing and needs no keys. A photo or note that is not in the cache gets 503 `demo answers the sample photos and notes only`. `POST /api/demo/reset` starts over on a fresh copy.

Record the cache with live keys, then commit it:

```bash
BANKAI_CACHE_DIR=data/replay bun apps/cli/src/main.ts eval --set <demo set> --projects data/projects
git add data/replay
```

## Deploy

The `Dockerfile` builds in two stages: it installs from the lockfile and bundles the app into one file, then the runtime image (`oven/bun` alpine) gets only the bundle, `sharp` (native, so it stays a package) and `data/`. It runs `bankai serve --demo` as the non-root `bun` user, on `PORT` (default 8080).

Cloud Run fits as is: it injects `PORT`, the server listens on all interfaces, and SIGTERM stops it cleanly (removing the demo copy). The demo copy lives in `/tmp`, which on Cloud Run is memory, so keep the project small. Set `BANKAI_PROJECT` and `BANKAI_ALLOWED_ORIGINS` (the app's hostname) on the service.

`--allow-unauthenticated` makes every route public, including `/api/project` and the evidence records. That is fine for the demo, whose project is synthetic. Never deploy a real project this way: there is no auth, and CORS does not stop direct callers.

Demo with the fixture project that ships in the image (switch to `data/projects/alpha` once it lands):

```bash
gcloud run deploy bankai --source . --region <region> --allow-unauthenticated \
  --set-env-vars BANKAI_PROJECT=data/fixtures/mini,BANKAI_ALLOWED_ORIGINS=<app host>
```
