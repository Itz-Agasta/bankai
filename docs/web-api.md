# Web API reference

`bankai serve` runs the HTTP server the phone app talks to. It uses the same core as the command line and the Model Context Protocol (MCP) server, so every answer carries the same citations and confidence. This page lists how to start it, its routes, and its errors.

## Start the server

Run it against a project folder:

```bash
bun apps/cli/src/main.ts serve --project data/fixtures/mini
```

It listens on `http://localhost:8787`. Pass `--demo` to answer only from recorded model responses on a throwaway copy of the project, with no API keys and no cost.

Settings come from the environment:

- **`BANKAI_PROJECT`**: project folder when `--project` is not given
- **`PORT`**: port when `--port` is not given
- **`BANKAI_ALLOWED_ORIGINS`**: comma separated hostnames a browser may call from, for example `localhost,your_app_host`
- **`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`**: model keys, not needed with `--demo`

## Routes

Request and response types are the zod schemas in `@bankai/schemas`.

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/health` | | `{ ok, version, demo, replay, project }` |
| `GET /api/project` | | Locations, equipment tags, purchase order (PO) lines and schedule activities for pickers |
| `POST /api/verify` | Multipart: `photos` (1 to 6), `location?`, `components?` (comma separated) | `VerifyResult` |
| `POST /api/delivery` | Multipart: `po`, `line?`, `ticket?`, `photos?` (0 to 6) | `VerifyResult` |
| `POST /api/notes` | Multipart: `audio` (one wav, mp3, m4a, ogg, webm or flac file) | `NoteRun` |
| `POST /api/updates/:id/approve` | JSON `{ approved_by }` | `ProposedUpdate`, approved |
| `POST /api/updates/:id/reject` | JSON `{ approved_by }` | `ProposedUpdate`, rejected |
| `GET /api/explain/:id` | | The stored verdict, note or update with every pipeline step |
| `GET /api/status` | | `{ open_items, pending_updates }` |
| `GET /api/evidence?kind=&ref=` | | `{ citation, record }`: the project row a citation points at |
| `GET /api/uploads/:name` | | An uploaded photo or audio file |
| `POST /api/demo/reset` | | Starts the demo over (demo mode only) |
| `/mcp` | MCP | The same 5 tools as the stdio MCP server |

The app relies on these rules:

- **Uploads only**: the server reads uploaded files and ignores client file names and paths. Citations name each upload by its content hash, and `/api/uploads/:name` serves it.
- **Role ids, never names**: `approved_by` is a role id such as `SUPT-01`. Tapping Approve is the approval.
- **Decisions are final**: approving twice returns the first approval, and an update someone rejected can't be approved (409).
- **Evidence by kind**: a submittal returns every row under its id, a proposed new decision or action returns `null`, and a photo or audio citation returns `{ file, region }`.

## Errors

Failures return `{ error: { code, message, detail? } }` with this status:

| Code | Status |
|---|---|
| `INPUT_UNSUPPORTED` | 400 |
| `INPUT_TOO_LARGE` | 413 |
| `NOT_FOUND` | 404 |
| `APPROVAL_REQUIRED` | 409 |
| `PERCEPTION_UNAVAILABLE` | 503 |
| `PROJECT_INVALID` | 500 |
| `INTERNAL` | 500 |

Each photo can be up to 20 MB and each audio file up to 25 MB. A request over 64 MB gets a plain 413 without the JSON body. In demo mode, a photo or note without a recorded answer returns 503.

## Browser access

Only hostnames in `BANKAI_ALLOWED_ORIGINS` can call the server from a browser; other origins get no cross-origin headers, and `/mcp` refuses them with 403. This allowlist is not authentication, so the public demo serves synthetic project data only.
