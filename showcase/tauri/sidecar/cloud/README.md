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

All `/api/v1/*` routes require `Authorization: Bearer <APEX_API_TOKEN>`. Request payloads are validated against the shared Zod contracts. Bodies are capped at 256 KiB.

## Current limitations (intentional)

- The default repository is in-memory: sessions, messages and tasks disappear when the process restarts.
- Task creation only queues a record. It does not execute an agent, computer action, code, or workflow.
- The bearer token is a single-owner bootstrap boundary, not multi-user OAuth or a production identity system.
- Before public deployment, replace the memory adapter with a durable database adapter, implement per-user identity and authorization, add rate limits, TLS, audit logging, retention/deletion controls, and approval workflows.
