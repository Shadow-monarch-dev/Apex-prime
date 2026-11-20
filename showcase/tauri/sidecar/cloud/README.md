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
- `POST /api/v1/tasks/:id/approval` — owner-authenticated approve/reject decision; approval requeues the registered handler with the decision attached, rejection cancels the task
- `PATCH /api/v1/tasks/:id` — owner-authenticated lifecycle update (`queued → running → waiting_approval → running → succeeded/failed`, or cancellation); invalid transitions return `409`
- `GET /api/v1/tasks/:id/events` — task event history

All `/api/v1/*` routes require `Authorization: Bearer <token>`. The API accepts either the local bootstrap token or a valid HS256 JWT, depending on server configuration. Request payloads are validated against the shared Zod contracts. Bodies are capped at 256 KiB.


## Opt-in task worker module

The worker is deliberately separate from the HTTP server. Start it only in a trusted worker process after supplying explicit, reviewed handlers. A task's `input` is data; it is never treated as shell code or dynamically imported instructions.

```js
import { createFileRepository } from './file-repository.mjs';
import { createTaskWorker } from './task-worker.mjs';

const repository = createFileRepository({ directory: process.env.APEX_DATA_DIR || './data' });
const worker = createTaskWorker({
  repository,
  handlers: {
    research: async ({ task, userId }) => {
      // Call a reviewed research implementation here.
      // Return { requiresApproval: true, message: '...' } before any consequential action.
      return { summary: 'Research handler placeholder', userId, query: task.input.query };
    },
  },
});
worker.start();
// On graceful shutdown: worker.stop();
```

The file repository serializes claims within one Node process only. Do not run multiple worker processes against the JSON file. Approval decisions are recorded on the task and in its event history. An approved task is requeued; the handler receives `approvalDecision` on its next run and must explicitly check it before performing the consequential action. Rejection cancels the task. The worker is a safe execution foundation, not yet a production distributed queue or a general-purpose computer-control agent.

## Current limitations (intentional)

- The standalone executable uses a single-process JSON-file repository in `APEX_DATA_DIR` (default: `./data`). Back up that directory. It is not safe for multiple server instances or ephemeral hosting disks; use a transactional database adapter for production.
- A registered-handler worker is available as an opt-in runtime module. It atomically claims queued tasks from the single-process file repository, runs only explicitly registered handlers, records success/failure, and can pause at `waiting_approval`. It is not started by the API server yet; deployment wiring, durable queue leasing/recovery, heartbeat/retries, and real safe tool handlers remain future work.
- The `APEX_API_TOKEN` fallback is a single-owner bootstrap boundary. For multi-user deployments, configure `APEX_JWT_SECRET` (at least 32 random bytes), `APEX_JWT_ISSUER`, and `APEX_JWT_AUDIENCE`; the API verifies HS256 bearer JWTs and scopes all repository operations to the verified `sub` claim. This module verifies tokens only: it does not issue tokens, register users, or replace an OIDC/OAuth identity provider. Connect a trusted issuer that signs matching tokens before enabling public access. The chat endpoint is a basic model bridge, not a complete Jarvis agent with tools or subagents.
- The JSON adapter is single-process only and is not a substitute for a managed transactional database on multi-instance hosting. Implement per-user identity and authorization, rate limits, TLS, audit logging, retention/deletion controls, and a dedicated approval record/decision workflow before public deployment.

## Desktop-to-cloud API client

Trusted desktop-sidecar code can use `client.mjs` to call the authenticated API without implementing HTTP details repeatedly:

```js
import { createApexApiClient } from './cloud/client.mjs';

const cloud = createApexApiClient({
  baseUrl: process.env.APEX_CLOUD_URL,
  token: process.env.APEX_CLOUD_TOKEN,
});
const { sessions } = await cloud.listSessions();
```

The client requires HTTPS except for localhost development, rejects URL credentials/query/fragments, disables redirects to avoid forwarding bearer credentials, supports abort signals/timeouts, and surfaces structured API error codes. Supply the token from the existing trusted secret store at runtime; do not hardcode it or expose it to browser UI code. This is a transport client foundation; it is not yet wired into the Tauri UI or an account sign-in flow.
