# APEX PRIME — Architecture Blueprint

**Status:** Initial target architecture (design document; not a claim that cloud services are already implemented)  
**Base:** Roamies desktop application, adapted incrementally  
**Architecture choice:** Hybrid — cloud brain with a lightweight desktop body  
**Repository:** `Shadow-monarch-dev/Apex-prime`

## 1. Product direction

APEX PRIME is a personal AI operator with a cloud-hosted reasoning and orchestration layer and an optional desktop companion. The desktop should remain usable on low-resource Windows hardware: rendering, audio capture/playback, user interaction, and explicitly approved local-device actions belong on the desktop; model inference, multi-agent orchestration, long-running jobs, and shared memory belong in cloud services where available.

The initial implementation must preserve the existing Roamies capabilities while introducing clean boundaries. Do not replace working modules wholesale until their behavior and tests are understood.

## 2. Current baseline and migration principle

The repository currently contains:
- A Tauri 2 desktop shell under `showcase/tauri/src-tauri`.
- Shared browser UI and interaction code under `showcase/roamies`.
- A Node.js sidecar/agent runtime under `showcase/tauri/sidecar`.
- Windows-specific voice and UI automation helpers.
- Existing safety policy and tests in the sidecar.

The current sidecar package is private, ESM-based, requires Node.js 22+, and includes agent/AI SDK dependencies. The desktop app is therefore not yet a separated, cloud-native service. Treat cloud extraction as a staged migration behind explicit interfaces.

**Migration rule:** keep the existing local mode working while introducing remote execution as an opt-in transport. Do not silently send conversation content, screenshots, files, or memory to a cloud service.

## 3. Logical system

```text
                 APEX PRIME Control Plane
        Identity • Settings • Approvals • Audit
                           |
                           v
Desktop Body <---- TLS API / Device Bridge ----> Cloud Brain
- Tauri UI                                      - API gateway
- chat & voice                                  - session / task service
- local device bridge                           - agent orchestrator
- permission prompts                            - model router
- local secure storage                           - job queue / workers
                                                - memory service
                                                - tool adapters
```

### Desktop Body
- Tauri shell and shared UI.
- Chat, voice input/output, status, task progress, approvals and settings.
- Optional local bridge for OS-specific capabilities.
- Device-scoped credentials stored using OS-provided secure storage where available.
- No mandatory local model downloads or heavy inference.

### Cloud Brain
- Authenticated API gateway.
- Conversation/session service.
- Agent orchestrator and model router.
- Durable task queue for long-running and scheduled work.
- Memory service with explicit user controls.
- Tool adapters for approved web, code, file and integration operations.
- Observability limited to operational metadata; avoid logging prompts, secrets, or file contents by default.

### Secure Device Bridge
- Outbound authenticated connection from desktop; no unauthenticated inbound listener.
- Short-lived device credentials and revocation.
- Per-capability permission scopes.
- Request signing / replay protection and TLS.
- Every local action is checked by the existing safety layer and recorded in an audit event.
- Destructive, external, financial, account, publishing, or data-sharing actions require a fresh human approval.

## 4. Service boundaries and API contracts

Keep contracts versioned under `/api/v1`. Initial endpoints are proposals:

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/sessions` | Create or resume an authenticated conversation |
| `POST /api/v1/sessions/{id}/messages` | Submit a user message; return a task/event identifier |
| `GET /api/v1/tasks/{id}` | Read task state and progress |
| `GET /api/v1/tasks/{id}/events` | Stream progress and assistant events (SSE or WebSocket, selected during implementation) |
| `POST /api/v1/approvals/{id}` | Approve or reject a pending action |
| `GET /api/v1/devices` | List the user's paired devices |
| `POST /api/v1/devices/pair` | Begin short-lived device pairing |
| `DELETE /api/v1/devices/{id}` | Revoke a paired device |

Contract requirements:
- Validate every request and response with shared schemas.
- Enforce user ownership at the service/data layer, not only in UI.
- Use idempotency keys for task creation and approval decisions.
- Return structured errors with stable error codes; never return provider secrets or stack traces.
- Use pagination and bounded payload sizes.
- Do not accept arbitrary shell commands or filesystem paths from an untrusted cloud request.

## 5. Core data model

The following are logical entities, not a committed database schema:

- **User:** identity-provider subject, account status, created timestamp.
- **Device:** user ID, public device ID, public key, platform, label, last seen, revoked timestamp.
- **Session:** user ID, title, created/updated timestamps, retention state.
- **Message:** session ID, role, content reference, timestamp, optional provider/model metadata. Sensitive payload storage must be encrypted and access-controlled.
- **Task:** user ID, session ID, status, task type, created/updated timestamps, retry count, cancellation state.
- **TaskEvent:** task ID, sequence number, event type, safe progress payload, timestamp.
- **MemoryItem:** user ID, category, encrypted content, source/consent metadata, retention/expiry, created/updated timestamps.
- **Approval:** user ID, task ID, action summary, exact requested scope, expiry, decision, decision timestamp.
- **AuditEvent:** user ID, device ID if applicable, actor, action type, target reference, outcome, timestamp, correlation ID. Avoid storing raw secrets or full content.

Every user-owned row must be isolated by authenticated user ID. Memory sync should be opt-in, exportable, and deletable. Retention defaults must be documented before enabling cloud persistence.

## 6. Authentication and authorization

- Use a mature identity provider; do not implement password storage from scratch.
- Browser/desktop sign-in should use OAuth/OIDC Authorization Code with PKCE where supported.
- Store refresh/device tokens only in OS secure storage on desktop and a secrets manager on the server.
- Use short-lived access tokens, rotation, revocation, and session/device management.
- Enforce authorization on every API request and every database query.
- Separate user identity from device identity.
- Never place provider API keys in the frontend bundle, repository, desktop logs, or database plaintext.
- Provide a local-only mode when cloud sign-in is unavailable.

## 7. Safety and tool execution

The existing `showcase/tauri/sidecar/safety.mjs` policy is a critical trust boundary. Preserve it and its tests.

All tool operations must:
1. Be represented as typed, validated requests.
2. Be authorized against user, device, and capability scopes.
3. Pass through the safety policy.
4. Be classified by risk.
5. Require explicit approval when the operation is consequential or externally visible.
6. Emit a minimal audit event.
7. Return a bounded result; never expose hidden credentials.

Default-deny capabilities include shell execution, arbitrary file writes/deletes, app control, browser actions that submit data, publishing, purchases, and account/security changes. Approval must show the exact action and target, not a vague “continue” prompt. A cloud agent must never be able to bypass the desktop's local safety gate.

## 8. Model routing and agent orchestration

- Define a provider-neutral model adapter interface.
- Route by task capability, context needs, availability, latency, and user-configured budget.
- Keep provider credentials server-side; support user-provided keys only through encrypted secret storage and clear consent.
- Record model/provider identifiers and token/cost metadata when available, but do not log full prompts by default.
- Bound agent iterations, tool calls, wall-clock time, concurrency, and spend.
- Support cancellation and retries with idempotent task semantics.
- Treat retrieved webpages, files, tool outputs, and model-generated plans as untrusted input.
- Subagents inherit the parent task's permissions; they cannot escalate scopes.

## 9. Memory and privacy

Separate:
- Conversation history (user-visible transcript).
- Durable user memory (explicitly reviewable and editable).
- Task/workflow state (execution records).
- Operational audit metadata (security and troubleshooting).

Cloud memory is off until the user opts in. Provide retention controls, export and deletion workflows. Encrypt data in transit and at rest. Minimize collection; do not retain screenshots or raw audio unless a feature explicitly needs it and the user has been informed. Show when data is sent to a model provider or integration. Do not use private user data to train models.

## 10. Deployment and cost constraints

The target is a low-cost cloud-first deployment, but **₹0 and guaranteed 24/7 availability cannot be promised**. Free tiers may sleep, impose quotas, require periodic verification, or change terms. Keep services portable:
- Stateless API and workers should be containerizable.
- Database and queue should be replaceable behind adapters.
- Use environment-based configuration and managed secrets.
- Separate development, staging and production environments.
- Add health checks, backups, migration procedures, rate limits and graceful quota handling before production use.

Never require a payment method or enable paid resources without the user's explicit informed approval. No API key or cloud credential should be committed to Git.

## 11. Testing and release gates

- Preserve and run the existing sidecar test suite.
- Add contract tests for cloud API schemas and auth boundaries.
- Add authorization tests proving cross-user reads/writes are denied.
- Add safety tests for every new tool capability and risk rule.
- Add tests for token expiry, revocation, replay, cancellation and idempotency.
- Add UI tests for approval prompts and cloud/local mode disclosure.
- Add dependency and secret scanning to CI.
- Do not call a feature complete until tests pass and failure behavior is documented.

Existing project instructions in `AGENTS.md` remain authoritative: use the safety layer for tool operations, add tests with safety changes, keep CI green, never bypass hooks, and never commit secrets.

## 12. Phased implementation

1. **Foundation (this branch):** document architecture, map current modules, preserve licensing and existing behavior.
2. **Boundary extraction:** define shared schemas and transport interfaces; add local/mock transport tests.
3. **Cloud API foundation:** identity integration, session/task APIs, health checks and database isolation.
4. **Agent runtime:** move eligible orchestration to workers behind provider-neutral adapters.
5. **Memory:** opt-in encrypted sync and user controls.
6. **Device bridge:** pairing, capability grants, revocation and approval protocol.
7. **Desktop experience:** APEX PRIME branding, cloud/local status, task monitor, voice and approvals.
8. **Integrations and schedules:** add individually permissioned connectors and durable scheduled jobs.
9. **Hardening:** security review, load tests, backups, deployment documentation and release gates.

Each phase should be delivered as a small reviewable set of commits/PRs. Do not remove existing Roamies functionality until an equivalent APEX PRIME path is tested.

## 13. Licensing and attribution

The inherited repository is licensed under **GNU AGPL-3.0**. Preserve the upstream license, copyright notices, and third-party attributions. Before distributing modified builds or operating a modified network service, review and satisfy the applicable AGPL source-availability and notice obligations, including the network-interaction provision. Clearly identify APEX PRIME as a modified project and do not imply endorsement by the original authors.
