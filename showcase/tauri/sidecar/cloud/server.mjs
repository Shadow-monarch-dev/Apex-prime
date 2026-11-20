// APEX PRIME API server. This is an authenticated API foundation, not an agent executor.
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  CreateChatRequestSchema, CreateMessageRequestSchema, CreateSessionRequestSchema, CreateTaskRequestSchema,
  ApprovalDecisionSchema, MessageSchema, SessionSchema, TaskSchema, TaskEventSchema, UpdateTaskStatusRequestSchema,
} from './contracts.mjs';
import { createMemoryRepository } from './memory-repository.mjs';
import { createFileRepository } from './file-repository.mjs';
import { createJwtAuthenticator } from './jwt-auth.mjs';
import { createTaskWorker } from './task-worker.mjs';

const MAX_BODY_BYTES = 256 * 1024;
const json = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(value));
};
const error = (res, status, code, message) => json(res, status, { error: { code, message } });
const equalSecret = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
};
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const e = new Error('Request body too large');
      e.status = 413;
      throw e;
    }
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { const e = new Error('Request body must be valid JSON'); e.status = 400; throw e; }
}
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const e = new Error('Request validation failed');
    e.status = 400;
    e.details = result.error.issues.map(({ path, message }) => ({ path, message }));
    throw e;
  }
  return result.data;
}

export function createApiServer({ repository = createMemoryRepository(), token, userId = 'local-owner', authenticate = null, chatProvider = null, taskHandlers = {}, workerPollIntervalMs = 1_000 } = {}) {
  if (!authenticate && (!token || Buffer.byteLength(token) < 24)) throw new Error('Provide an authenticator or APEX_API_TOKEN of at least 24 bytes');
  if (!repository) throw new Error('A repository adapter is required');

  const worker = Object.keys(taskHandlers).length
    ? createTaskWorker({ repository, handlers: taskHandlers, pollIntervalMs: workerPollIntervalMs, onError: (e) => console.error('[apex-worker]', e?.message || 'Task handler error') })
    : null;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { app: 'APEX PRIME API', status: 'online' });
      const auth = req.headers.authorization ?? '';
      let identity;
      if (authenticate) {
        try { identity = await authenticate(auth); } catch { identity = null; }
        if (!identity?.userId) return error(res, 401, 'UNAUTHORIZED', 'A valid access token is required.');
      } else {
        if (!auth.startsWith('Bearer ') || !equalSecret(auth.slice(7), token)) return error(res, 401, 'UNAUTHORIZED', 'A valid bearer token is required.');
        identity = { userId };
      }
      const requestUserId = identity.userId;

      if (req.method === 'POST' && url.pathname === '/api/v1/chat') {
        if (!chatProvider) return error(res, 503, 'AI_NOT_CONFIGURED', 'No AI provider is configured on the server.');
        const body = parse(CreateChatRequestSchema, await readBody(req));
        const session = await repository.getSession(requestUserId, body.sessionId);
        if (!session || session.status !== 'active') return error(res, 404, 'NOT_FOUND', 'Active session not found.');
        const history = await repository.listMessages(requestUserId, body.sessionId);
        const userMessage = await repository.addMessage(requestUserId, body.sessionId, body.content);
        const messages = [...history, userMessage].slice(-20).map(({ role, content }) => ({ role, content }));
        try {
          const answer = await chatProvider.complete(messages);
          const assistantMessage = await repository.addAssistantMessage(requestUserId, body.sessionId, answer);
          return json(res, 200, { message: MessageSchema.parse(assistantMessage) });
        } catch (e) {
          const status = e.status === 429 ? 429 : 502;
          return error(res, status, status === 429 ? 'AI_RATE_LIMITED' : 'AI_PROVIDER_ERROR', e.message || 'AI request failed.');
        }
      }
      if (req.method === 'GET' && url.pathname === '/api/v1/sessions') {
        return json(res, 200, { sessions: (await repository.listSessions(requestUserId)).map((s) => SessionSchema.parse(s)) });
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/sessions') {
        const body = parse(CreateSessionRequestSchema, await readBody(req));
        const session = SessionSchema.parse(await repository.createSession({ userId: requestUserId, ...body }));
        return json(res, 201, { session });
      }

      const sessionMatch = url.pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/);
      if (req.method === 'GET' && sessionMatch) {
        const session = await repository.getSession(requestUserId, decodeURIComponent(sessionMatch[1]));
        return session ? json(res, 200, { session: SessionSchema.parse(session) }) : error(res, 404, 'NOT_FOUND', 'Session not found.');
      }
      const messagesMatch = url.pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/messages$/);
      if (messagesMatch && req.method === 'GET') {
        const items = await repository.listMessages(requestUserId, decodeURIComponent(messagesMatch[1]));
        return items ? json(res, 200, { messages: items.map((m) => MessageSchema.parse(m)) }) : error(res, 404, 'NOT_FOUND', 'Session not found.');
      }
      if (messagesMatch && req.method === 'POST') {
        const body = parse(CreateMessageRequestSchema, await readBody(req));
        const message = await repository.addMessage(requestUserId, decodeURIComponent(messagesMatch[1]), body.content);
        return message ? json(res, 201, { message: MessageSchema.parse(message) }) : error(res, 404, 'NOT_FOUND', 'Active session not found.');
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/tasks') {
        const body = parse(CreateTaskRequestSchema, await readBody(req));
        const task = await repository.createTask(requestUserId, body);
        return task ? json(res, 202, { task: TaskSchema.parse(task) }) : error(res, 404, 'NOT_FOUND', 'Session not found.');
      }
      const approvalMatch = url.pathname.match(/^\/api\/v1\/tasks\/([^/]+)\/approval$/);
      if (req.method === 'POST' && approvalMatch) {
        const taskId = decodeURIComponent(approvalMatch[1]);
        const body = parse(ApprovalDecisionSchema, await readBody(req));
        if (body.approvalId !== taskId) return error(res, 400, 'APPROVAL_ID_MISMATCH', 'Approval ID must match the task ID.');
        const task = await repository.decideTaskApproval(requestUserId, taskId, body.decision, body.reason);
        if (!task) return error(res, 404, 'NOT_FOUND', 'Pending approval not found.');
        return json(res, 200, { task: TaskSchema.parse(task) });
      }
      const taskEventsMatch = url.pathname.match(/^\/api\/v1\/tasks\/([^/]+)\/events$/);
      if (req.method === 'GET' && taskEventsMatch) {
        const events = await repository.listTaskEvents(requestUserId, decodeURIComponent(taskEventsMatch[1]));
        return events ? json(res, 200, { events: events.map((event) => TaskEventSchema.parse(event)) }) : error(res, 404, 'NOT_FOUND', 'Task not found.');
      }
      const taskMatch = url.pathname.match(/^\/api\/v1\/tasks\/([^/]+)$/);
      if (req.method === 'PATCH' && taskMatch) {
        const body = parse(UpdateTaskStatusRequestSchema, await readBody(req));
        try {
          const task = await repository.updateTaskStatus(requestUserId, decodeURIComponent(taskMatch[1]), body.status, body.message);
          return task ? json(res, 200, { task: TaskSchema.parse(task) }) : error(res, 404, 'NOT_FOUND', 'Task not found.');
        } catch (e) {
          if (e.code === 'INVALID_TRANSITION') return error(res, 409, 'INVALID_TRANSITION', e.message);
          throw e;
        }
      }
      if (req.method === 'GET' && taskMatch) {
        const task = await repository.getTask(requestUserId, decodeURIComponent(taskMatch[1]));
        return task ? json(res, 200, { task: TaskSchema.parse(task) }) : error(res, 404, 'NOT_FOUND', 'Task not found.');
      }
      if (req.method === 'GET' && url.pathname === '/api/v1/tasks') {
        const sessionId = url.searchParams.get('sessionId') || undefined;
        return json(res, 200, { tasks: (await repository.listTasks(requestUserId, sessionId)).map((t) => TaskSchema.parse(t)) });
      }
      return error(res, 404, 'NOT_FOUND', 'Route not found.');
    } catch (e) {
      if (e.status === 413) return error(res, 413, 'BODY_TOO_LARGE', e.message);
      if (e.status === 400) return json(res, 400, { error: { code: 'BAD_REQUEST', message: e.message, details: e.details } });
      console.error('[apex-api]', e);
      return error(res, 500, 'INTERNAL_ERROR', 'The request could not be completed.');
    }
  });
  if (worker) {
    server.on('listening', () => worker.start());
    server.on('close', () => worker.stop());
  }
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const token = process.env.APEX_API_TOKEN;
  const jwtSecret = process.env.APEX_JWT_SECRET;
  if ((!token || Buffer.byteLength(token) < 24) && (!jwtSecret || Buffer.byteLength(jwtSecret) < 32)) {
    console.error('Set APEX_JWT_SECRET (32+ bytes) or APEX_API_TOKEN (24+ bytes).');
    process.exitCode = 1;
  } else {
    const host = process.env.APEX_API_HOST || '127.0.0.1';
    const port = Number(process.env.APEX_API_PORT || 8787);
    const dataDir = process.env.APEX_DATA_DIR || path.resolve('data');
    const repository = createFileRepository({ directory: dataDir });
    const { createChatProvider } = await import('./ai-provider.mjs');
    const chatProvider = process.env.APEX_AI_API_KEY && process.env.APEX_AI_MODEL
      ? createChatProvider({ apiKey: process.env.APEX_AI_API_KEY, baseUrl: process.env.APEX_AI_BASE_URL || 'https://api.openai.com/v1', model: process.env.APEX_AI_MODEL })
      : null;
    const authenticate = jwtSecret ? createJwtAuthenticator({ secret: jwtSecret, issuer: process.env.APEX_JWT_ISSUER || 'apex-prime', audience: process.env.APEX_JWT_AUDIENCE || 'apex-prime-api' }) : null;
    const taskHandlers = chatProvider
      ? (await import('./assistant-handlers.mjs')).createAssistantTaskHandlers({ repository, chatProvider })
      : {};
    const server = createApiServer({ token, authenticate, repository, chatProvider, taskHandlers });
    server.listen(port, host, () => console.log(`APEX PRIME API listening on http://${host}:${port}`));
  }
}
