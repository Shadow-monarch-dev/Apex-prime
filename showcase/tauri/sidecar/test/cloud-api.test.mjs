import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApiServer } from '../cloud/server.mjs';

const token = 'test-token-that-is-long-enough-123456';
const server = createApiServer({ token, chatProvider: { async complete(messages) { assert.ok(messages.some((m) => m.role === 'user')); return 'Hello from the APEX test brain.'; } } });
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

  r = await request('/api/v1/chat', { method: 'POST', headers: auth, body: JSON.stringify({ sessionId: session.id, content: 'Introduce yourself' }) });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).message.content, 'Hello from the APEX test brain.');

  r = await request('/api/v1/sessions/' + session.id + '/messages', { headers: auth });
  assert.equal(r.status, 200);
  const history = (await r.json()).messages;
  assert.deepEqual(history.map((m) => m.role), ['user', 'assistant']);

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

  r = await request(`/api/v1/tasks/${task.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ status: 'running', message: 'Worker claimed task' }) });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).task.status, 'running');

  r = await request(`/api/v1/tasks/${task.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ status: 'waiting_approval', message: 'Human approval required' }) });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).task.status, 'waiting_approval');

  r = await request(`/api/v1/tasks/${task.id}/events`, { headers: auth });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).events.length, 3);

  r = await request(`/api/v1/tasks/${task.id}/approval`, { method: 'POST', headers: auth, body: JSON.stringify({ approvalId: task.id, decision: 'approve', reason: 'Owner reviewed the request' }) });
  assert.equal(r.status, 200);
  const approved = (await r.json()).task;
  assert.equal(approved.status, 'queued');
  assert.equal(approved.approvalDecision.decision, 'approve');

  r = await request(`/api/v1/tasks/${task.id}/approval`, { method: 'POST', headers: auth, body: JSON.stringify({ approvalId: task.id, decision: 'approve' }) });
  assert.equal(r.status, 404, 'a completed decision cannot be replayed');

  r = await request(`/api/v1/tasks/${task.id}/events`, { headers: auth });
  assert.equal((await r.json()).events.at(-1).type, 'approval_decided');

  r = await request(`/api/v1/tasks/${task.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ status: 'succeeded' }) });
  assert.equal(r.status, 409, 'waiting approval cannot be skipped');

  r = await request('/api/v1/sessions', { method: 'POST', headers: auth, body: JSON.stringify({ title: 'secret', apiKey: 'nope' }) });
  assert.equal(r.status, 400, 'unexpected fields are rejected');

  r = await request('/api/v1/tasks', { method: 'POST', headers: auth, body: JSON.stringify({ sessionId: 'missing', kind: 'code', input: {} }) });
  assert.equal(r.status, 404);
} finally {
  server.close();
  await once(server, 'close');
}
console.log('cloud API runtime tests: passed');
