import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createFileRepository } from '../cloud/file-repository.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'apex-file-repo-'));
try {
  const first = createFileRepository({ directory });
  const session = await first.createSession({ userId: 'owner-a', title: 'Persistent session' });
  const message = await first.addMessage('owner-a', session.id, 'Keep this after restart');
  assert.equal(message.content, 'Keep this after restart');
  const task = await first.createTask('owner-a', { sessionId: session.id, kind: 'research', input: { query: 'persist' } });
  assert.equal(task.status, 'queued');
  assert.equal(await first.getSession('owner-b', session.id), null);
  assert.equal(await first.getTask('owner-b', task.id), null);

  const parallel = await Promise.all(Array.from({ length: 12 }, (_, i) => first.createSession({ userId: 'owner-a', title: `Parallel ${i}` })));
  assert.equal(new Set(parallel.map((item) => item.id)).size, 12);

  const restarted = createFileRepository({ directory });
  assert.equal((await restarted.getSession('owner-a', session.id)).title, 'Persistent session');
  assert.equal((await restarted.listMessages('owner-a', session.id))[0].content, message.content);
  assert.equal((await restarted.getTask('owner-a', task.id)).id, task.id);
  assert.equal((await restarted.listSessions('owner-b')).length, 0);
  assert.equal((await restarted.listSessions('owner-a')).length, 13);

  const stored = JSON.parse(await readFile(path.join(directory, 'apex-state.json'), 'utf8'));
  assert.equal(stored.version, 1);
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log('cloud file repository tests: passed');
