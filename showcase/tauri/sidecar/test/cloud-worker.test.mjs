import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createFileRepository } from '../cloud/file-repository.mjs';
import { createTaskWorker } from '../cloud/task-worker.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'apex-worker-'));
try {
  const repository = createFileRepository({ directory });
  const session = await repository.createSession({ userId: 'owner-a', title: 'Worker test' });
  const doneTask = await repository.createTask('owner-a', { sessionId: session.id, kind: 'research', input: { query: 'safe query' } });
  const worker = createTaskWorker({
    repository,
    handlers: { research: async ({ task, userId }) => ({ summary: `Completed for ${userId}: ${task.input.query}` }) },
  });
  const result = await worker.runOnce();
  assert.equal(result.taskId, doneTask.id);
  assert.equal(result.status, 'succeeded');
  assert.equal((await repository.getTask('owner-a', doneTask.id)).status, 'succeeded');

  const approvalTask = await repository.createTask('owner-a', { sessionId: session.id, kind: 'computer', input: { action: 'not-executed' } });
  const approvalWorker = createTaskWorker({ repository, handlers: { computer: async () => ({ requiresApproval: true, message: 'Review this action first' }) } });
  assert.equal((await approvalWorker.runOnce()).status, 'waiting_approval');
  assert.equal((await repository.getTask('owner-a', approvalTask.id)).status, 'waiting_approval');

  const missingTask = await repository.createTask('owner-a', { sessionId: session.id, kind: 'code', input: {} });
  assert.equal((await worker.runOnce()).status, 'failed');
  assert.equal((await repository.getTask('owner-a', missingTask.id)).status, 'failed');

  const failingTask = await repository.createTask('owner-a', { sessionId: session.id, kind: 'research', input: {} });
  const failingWorker = createTaskWorker({ repository, handlers: { research: async () => { throw new Error('private internal detail'); } } });
  assert.equal((await failingWorker.runOnce()).status, 'failed');
  assert.equal((await repository.getTask('owner-a', failingTask.id)).status, 'failed');

  const parallelTasks = await Promise.all(Array.from({ length: 5 }, (_, i) => repository.createTask('owner-a', { sessionId: session.id, kind: 'research', input: { i } })));
  const claims = await Promise.all(Array.from({ length: 5 }, () => repository.claimNextTask()));
  assert.equal(new Set(claims.map((claim) => claim.task.id)).size, 5);
  assert.deepEqual(new Set(claims.map((claim) => claim.task.id)), new Set(parallelTasks.map((task) => task.id)));
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log('cloud task worker tests: passed');
