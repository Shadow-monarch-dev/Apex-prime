// APEX PRIME API server. This is an authenticated API foundation, not an agent executor.
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  ApiErrorSchema, CreateMessageRequestSchema, CreateSessionRequestSchema, CreateTaskRequestSchema,
  MessageSchema, SessionSchema, TaskSchema,
} from './contracts.mjs';
import { createMemoryRepository } from './memory-repository.mjs';
import { createFileRepository } from './file-repository.mjs';

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

export function createApiServer({ repository = createMemoryRepository(), token, userId = 'local-owner' } = {}) {
  if (!token || Buffer.byteLength(token) < 24) throw new Error('APEX_API_TOKEN must be at least 24 bytes');
  if (!repository) throw new Error('A repository adapter is required');

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { app: 'APEX PRIME API', status: 'online' });
      const auth = req.headers.authorization ?? '';
      if (!auth.startsWith('Bearer ') || !equalSecret(auth.slice(7), token)) return error(res, 401, 'UNAUTHORIZED', 'A valid bearer token is required.');

      if (req.method === 'GET' && url.pathname === '/api/v1/sessions') {
        return json(res, 200, { sessions: (await repository.listSessions(userId)).map((s) => SessionSchema.parse(s)) });
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/sessions') {
        const body = parse(CreateSessionRequestSchema, await readBody(req));
        const session = SessionSchema.parse(await repository.createSession({ userId, ...body }));
        return json(res, 201, { session });
      }

      const sessionMatch = url.pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/);
      if (req.method === 'GET' && sessionMatch) {
        const session = await repository.getSession(userId, decodeURIComponent(sessionMatch[1]));
        return session ? json(res, 200, { session: SessionSchema.parse(session) }) : error(res, 404, 'NOT_FOUND', 'Session not found.');
      }
      const messagesMatch = url.pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/messages$/);
      if (messagesMatch && req.method === 'GET') {
        const items = await repository.listMessages(userId, decodeURIComponent(messagesMatch[1]));
        return items ? json(res, 200, { messages: items.map((m) => MessageSchema.parse(m)) }) : error(res, 404, 'NOT_FOUND', 'Session not found.');
      }
      if (messagesMatch && req.method === 'POST') {
        const body = parse(CreateMessageRequestSchema, await readBody(req));
        const message = await repository.addMessage(userId, decodeURIComponent(messagesMatch[1]), body.content);
        return message ? json(res, 201, { message: MessageSchema.parse(message) }) : error(res, 404, 'NOT_FOUND', 'Active session not found.');
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/tasks') {
        const body = parse(CreateTaskRequestSchema, await readBody(req));
        const task = await repository.createTask(userId, body);
        return task ? json(res, 202, { task: TaskSchema.parse(task) }) : error(res, 404, 'NOT_FOUND', 'Session not found.');
      }
      const taskMatch = url.pathname.match(/^\/api\/v1\/tasks\/([^/]+)$/);
      if (req.method === 'GET' && taskMatch) {
        const task = await repository.getTask(userId, decodeURIComponent(taskMatch[1]));
        return task ? json(res, 200, { task: TaskSchema.parse(task) }) : error(res, 404, 'NOT_FOUND', 'Task not found.');
      }
      if (req.method === 'GET' && url.pathname === '/api/v1/tasks') {
        const sessionId = url.searchParams.get('sessionId') || undefined;
        return json(res, 200, { tasks: (await repository.listTasks(userId, sessionId)).map((t) => TaskSchema.parse(t)) });
      }
      return error(res, 404, 'NOT_FOUND', 'Route not found.');
    } catch (e) {
      if (e.status === 413) return error(res, 413, 'BODY_TOO_LARGE', e.message);
      if (e.status === 400) return json(res, 400, { error: { code: 'BAD_REQUEST', message: e.message, details: e.details } });
      console.error('[apex-api]', e);
      return error(res, 500, 'INTERNAL_ERROR', 'The request could not be completed.');
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const token = process.env.APEX_API_TOKEN;
  if (!token || Buffer.byteLength(token) < 24) {
    console.error('Set APEX_API_TOKEN to a random secret of at least 24 bytes.');
    process.exitCode = 1;
  } else {
    const host = process.env.APEX_API_HOST || '127.0.0.1';
    const port = Number(process.env.APEX_API_PORT || 8787);
    const dataDir = process.env.APEX_DATA_DIR || path.resolve('data');
    const repository = createFileRepository({ directory: dataDir });
    const server = createApiServer({ token, repository });
    server.listen(port, host, () => console.log(`APEX PRIME API listening on http://${host}:${port}`));
  }
}
