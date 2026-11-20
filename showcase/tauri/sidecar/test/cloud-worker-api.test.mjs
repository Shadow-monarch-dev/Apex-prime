import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApiServer } from '../cloud/server.mjs';
import { createFileRepository } from '../cloud/file-repository.mjs';
import { createAssistantTaskHandlers } from '../cloud/assistant-handlers.mjs';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-worker-api-'));
const repository = createFileRepository({ directory });
const token = 'worker-integration-test-token-123456';
const provider = { async complete(messages) { return 'Worker reply: ' + messages.at(-1).content; } };
const taskHandlers = createAssistantTaskHandlers({ repository, chatProvider: provider });
const server = createApiServer({ repository, token, taskHandlers, workerPollIntervalMs: 100 });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = 'http://127.0.0.1:' + server.address().port;
const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
const post = async (url, body) => fetch(base + url, { method: 'POST', headers, body: JSON.stringify(body) });
try {
  let response = await post('/api/v1/sessions', { title: 'Worker integration' });
  assert.equal(response.status, 201);
  const { session } = await response.json();
  response = await post('/api/v1/tasks', { sessionId: session.id, kind: 'chat', input: { content: 'hello worker' } });
  assert.equal(response.status, 202);
  const { task } = await response.json();

  let current;
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    response = await fetch(base + '/api/v1/tasks/' + task.id, { headers });
    current = (await response.json()).task;
    if (current.status === 'succeeded' || current.status === 'failed') break;
  }
  assert.equal(current.status, 'succeeded');
  assert.deepEqual(current.result, { messageId: (await repository.listMessages('local-owner', session.id)).at(-1).id, content: 'Worker reply: hello worker' });
  response = await fetch(base + '/api/v1/sessions/' + session.id + '/messages', { headers });
  const { messages } = await response.json();
  assert.deepEqual(messages.map((message) => message.role), ['user', 'assistant']);
  assert.equal(messages.at(-1).content, 'Worker reply: hello worker');
} finally {
  server.close();
  await once(server, 'close');
  await fs.rm(directory, { recursive: true, force: true });
}
console.log('cloud worker API integration tests: passed');
