import assert from 'node:assert/strict';
import { createAssistantTaskHandlers } from '../cloud/assistant-handlers.mjs';

const calls = [];
const repository = {
  async getSession(userId, id) { calls.push(['session', userId, id]); return { status: 'active' }; },
  async listMessages(userId, id) { return [{ role: 'user', content: 'Earlier' }]; },
  async addAssistantMessage(userId, id, content) { return { id: 'm1', sessionId: id, role: 'assistant', content }; },
};
const provider = { async complete(messages) { calls.push(['complete', messages]); return 'Answer'; } };
const handlers = createAssistantTaskHandlers({ repository, chatProvider: provider });
const result = await handlers.chat({ userId: 'u1', task: { sessionId: 's1', input: { content: 'Hello' } } });
assert.equal(result.content, 'Answer');
assert.equal(calls[0][1], 'u1');
assert.deepEqual(calls[1][1].at(-1), { role: 'user', content: 'Hello' });
await assert.rejects(handlers.chat({ userId: 'u1', task: { sessionId: 's1', input: {} } }), /input.content/);
await assert.rejects(handlers.chat({ userId: 'u1', approvalDecision: { decision: 'reject' }, task: { sessionId: 's1', input: { content: 'Hello' } } }), /Rejected/);
await assert.rejects(Promise.resolve().then(() => createAssistantTaskHandlers({ repository, chatProvider: null })), /chat provider/);
console.log('assistant task handler tests: passed');
