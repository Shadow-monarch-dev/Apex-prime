# APEX PRIME API foundation

This is the first standalone API runtime layer. It does not replace the existing Tauri/sidecar entry point.

## Run locally (Node.js 22+)

PowerShell:
```powershell
$env:APEX_API_TOKEN = "replace-with-a-random-secret-at-least-24-bytes"
node .\cloud\server.mjs
```

The server binds to `127.0.0.1:8787` by default. Set `APEX_API_HOST=0.0.0.0` only when you intentionally expose it behind a properly configured TLS reverse proxy and network firewall. Never commit the token.

## Configure the AI brain (OpenAI-compatible API)

Set these server-side environment variables before starting the API:

```powershell
$env:APEX_AI_API_KEY = 'your-provider-key'
$env:APEX_AI_MODEL = 'provider-model-id'
# Optional for compatible providers (default is OpenAI):
$env:APEX_AI_BASE_URL = 'https://api.openai.com/v1'
```

The key never comes from a client request and is never returned by the API. If no provider key/model is configured, chat returns `503 AI_NOT_CONFIGURED`. A configured OpenAI-compatible provider receives the last 20 session messages. Provider calls are server-side; use a provider account whose terms and age requirements you can meet.

## Routes
- `POST /api/v1/chat` — authenticated chat turn; stores the user message and assistant reply in the session

- `GET /health` — liveness only; no account data.
- `GET, POST /api/v1/sessions`
- `GET /api/v1/sessions/:id`
- `GET, POST /api/v1/sessions/:id/messages`
- `GET, POST /api/v1/tasks`
- `GET /api/v1/tasks/:id`
- `PATCH /api/v1/tasks/:id` — owner-authenticated lifecycle update (`queued → running → waiting_approval → running → succeeded/failed`, or cancellation); invalid transitions return `409`
- `GET /api/v1/tasks/:id/events` — task event history

All `/api/v1/*` routes require `Authorization: Bearer <token>`. The API accepts either the local bootstrap token or a valid HS256 JWT, depending on server configuration. Request payloads are validated against the shared Zod contracts. Bodies are capped at 256 KiB.

## Current limitations (intentional)

- The standalone executable uses a single-process JSON-file repository in `APEX_DATA_DIR` (default: `./data`). Back up that directory. It is not safe for multiple server instances or ephemeral hosting disks; use a transactional database adapter for production.
- Task creation queues a record and the API supports owner-authenticated status transitions and event history. There is still no autonomous background worker, tool execution, computer control, or agent orchestration; queued tasks do not run automatically.
- The `APEX_API_TOKEN` fallback is a single-owner bootstrap boundary. For multi-user deployments, configure `APEX_JWT_SECRET` (at least 32 random bytes), `APEX_JWT_ISSUER`, and `APEX_JWT_AUDIENCE`; the API verifies HS256 bearer JWTs and scopes all repository operations to the verified `sub` claim. This module verifies tokens only: it does not issue tokens, register users, or replace an OIDC/OAuth identity provider. Connect a trusted issuer that signs matching tokens before enabling public access. The chat endpoint is a basic model bridge, not a complete Jarvis agent with tools or subagents.
- The JSON adapter is single-process only and is not a substitute for a managed transactional database on multi-instance hosting. Implement per-user identity and authorization, rate limits, TLS, audit logging, retention/deletion controls, and a dedicated approval record/decision workflow before public deployment.
