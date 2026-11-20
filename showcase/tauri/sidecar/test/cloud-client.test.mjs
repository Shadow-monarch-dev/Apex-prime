import assert from 'node:assert/strict';
import { createApexApiClient } from '../cloud/client.mjs';

const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url, options });
  return { ok: true, status: 200, async json() { return { ok: true }; } };
};
const client = createApexApiClient({ baseUrl: 'https://api.example.test/', token: 'a'.repeat(32), fetchImpl });
await client.chat('session/one', 'Hello');
assert.equal(calls[0].url, 'https://api.example.test/api/v1/chat');
assert.deepEqual(JSON.parse(calls[0].options.body), { sessionId: 'session/one', content: 'Hello' });
assert.equal(calls[0].options.headers.authorization, 'Bearer ' + 'a'.repeat(32));
assert.equal(calls[0].options.redirect, 'error');

await client.decideApproval('task/one', 'approve', 'Reviewed');
assert.equal(calls[1].url, 'https://api.example.test/api/v1/tasks/task%2Fone/approval');
assert.deepEqual(JSON.parse(calls[1].options.body), { approvalId: 'task/one', decision: 'approve', reason: 'Reviewed' });

await client.listTasks('session/one');
assert.equal(calls[2].url, 'https://api.example.test/api/v1/tasks?sessionId=session%2Fone');
assert.throws(() => createApexApiClient({ baseUrl: 'http://api.example.test', token: 'a'.repeat(32), fetchImpl }), /HTTPS/);
assert.throws(() => createApexApiClient({ baseUrl: 'https://user:pass@example.test', token: 'a'.repeat(32), fetchImpl }), /credentials/);
assert.throws(() => createApexApiClient({ baseUrl: 'https://example.test', token: 'short', fetchImpl }), /24 characters/);

const failing = createApexApiClient({
  baseUrl: 'https://api.example.test',
  token: 'b'.repeat(32),
  fetchImpl: async () => ({ ok: false, status: 429, async json() { return { error: { code: 'AI_RATE_LIMITED', message: 'Slow down' } }; } }),
});
await assert.rejects(failing.chat('s', 'hi'), (error) => error.status === 429 && error.code === 'AI_RATE_LIMITED');
console.log('cloud API client tests: passed');
