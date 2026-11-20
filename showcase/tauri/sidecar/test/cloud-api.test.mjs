import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApiServer } from '../cloud/server.mjs';

const token = 'test-token-that-is-long-enough-123456';
const server = createApiServer({ token });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;
const request = (path, options = {}) => fetch(base + path, {
  ...options,
  headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers ?? {}) },
});
const auth = { authorization: `Bearer ${token}` };
try {
  let r = await request('/health');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'online');

  r = await request('/api/v1/sessions');
  assert.equal(r.status, 401, 'API endpoints require authentication');

  r = await request('/api/v1/sessions', { headers: auth });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).sessions, []);

  r = await request('/api/v1/sessions', { method: 'POST', headers: auth, body: JSON.stringify({ title: 'Test session' }) });
  assert.equal(r.status, 201);
  const { session } = await r.json();
  assert.equal(session.title, 'Test session');

  r = await request(`/api/v1/sessions/${session.id}/messages`, { method: 'POST', headers: auth, body: JSON.stringify({ content: 'Hello APEX' }) });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).message.content, 'Hello APEX');

  r = await request('/api/v1/tasks', { method: 'POST', headers: auth, body: JSON.stringify({ sessionId: session.id, kind: 'research', input: { query: 'AI agents' } }) });
  assert.equal(r.status, 202);
  const { task } = await r.json();
  assert.equal(task.status, 'queued');

  r = await request(`/api/v1/tasks/${task.id}`, { headers: auth });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).task.id, task.id);

  r = await request('/api/v1/sessions', { method: 'POST', headers: auth, body: JSON.stringify({ title: 'secret', apiKey: 'nope' }) });
  assert.equal(r.status, 400, 'unexpected fields are rejected');

  r = await request('/api/v1/tasks', { method: 'POST', headers: auth, body: JSON.stringify({ sessionId: 'missing', kind: 'code', input: {} }) });
  assert.equal(r.status, 404);
} finally {
  server.close();
  await once(server, 'close');
}
console.log('cloud API runtime tests: passed');
