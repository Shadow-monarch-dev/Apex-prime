# APEX PRIME API foundation

This is the first standalone API runtime layer. It does not replace the existing Tauri/sidecar entry point.

## Run locally (Node.js 22+)

PowerShell:
```powershell
$env:APEX_API_TOKEN = "replace-with-a-random-secret-at-least-24-bytes"
node .\cloud\server.mjs
```

The server binds to `127.0.0.1:8787` by default. Set `APEX_API_HOST=0.0.0.0` only when you intentionally expose it behind a properly configured TLS reverse proxy and network firewall. Never commit the token.

## Routes

- `GET /health` — liveness only; no account data.
- `GET, POST /api/v1/sessions`
- `GET /api/v1/sessions/:id`
- `GET, POST /api/v1/sessions/:id/messages`
- `GET, POST /api/v1/tasks`
- `GET /api/v1/tasks/:id`
- `PATCH /api/v1/tasks/:id` — owner-authenticated lifecycle update (`queued → running → waiting_approval → running → succeeded/failed`, or cancellation); invalid transitions return `409`
- `GET /api/v1/tasks/:id/events` — task event history

All `/api/v1/*` routes require `Authorization: Bearer <APEX_API_TOKEN>`. Request payloads are validated against the shared Zod contracts. Bodies are capped at 256 KiB.

## Current limitations (intentional)

- The standalone executable uses a single-process JSON-file repository in `APEX_DATA_DIR` (default: `./data`). Back up that directory. It is not safe for multiple server instances or ephemeral hosting disks; use a transactional database adapter for production.
- Task creation queues a record and the API supports owner-authenticated status transitions and event history. There is still no worker/agent executor; queued tasks do not run automatically.
- The bearer token is a single-owner bootstrap boundary, not multi-user OAuth or a production identity system.
- The JSON adapter is single-process only and is not a substitute for a managed transactional database on multi-instance hosting. Implement per-user identity and authorization, rate limits, TLS, audit logging, retention/deletion controls, and a dedicated approval record/decision workflow before public deployment.
