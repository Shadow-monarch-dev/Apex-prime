import assert from 'node:assert/strict';
import {
  ApiErrorSchema, ApprovalDecisionSchema, CreateMessageRequestSchema, CreateSessionRequestSchema,
  CreateTaskRequestSchema, MessageSchema, SessionSchema, TaskEventSchema, TaskSchema, parseContract,
} from '../cloud/contracts.mjs';

const now = '2026-11-20T08:00:00.000Z';
const session = { id: 'ses_123', userId: 'usr_123', title: 'Planning', status: 'active', createdAt: now, updatedAt: now };
assert.deepEqual(parseContract(SessionSchema, session), session);
assert.equal(parseContract(CreateSessionRequestSchema, {}).title, undefined, 'title remains optional when omitted');
assert.throws(() => parseContract(SessionSchema, { ...session, apiKey: 'must-not-be-accepted' }), /Unrecognized key/);
assert.throws(() => parseContract(SessionSchema, { ...session, createdAt: 'yesterday' }));

const message = { id: 'msg_123', sessionId: 'ses_123', role: 'user', content: 'Hello APEX', createdAt: now };
assert.deepEqual(parseContract(MessageSchema, message), message);
assert.throws(() => parseContract(CreateMessageRequestSchema, { content: '   ' }));
assert.throws(() => parseContract(CreateMessageRequestSchema, { content: 'Hi', providerApiKey: 'secret' }), /Unrecognized key/);

const task = { id: 'tsk_123', sessionId: 'ses_123', kind: 'research', status: 'queued', input: { query: 'AI agents' }, createdAt: now, updatedAt: now };
assert.deepEqual(parseContract(TaskSchema, task), task);
assert.deepEqual(parseContract(CreateTaskRequestSchema, { sessionId: 'ses_123', kind: 'code', input: { prompt: 'Write tests' } }).kind, 'code');
assert.throws(() => parseContract(TaskSchema, { ...task, status: 'done' }));

const event = { id: 'evt_123', taskId: 'tsk_123', type: 'progress', message: 'Searching sources', createdAt: now };
assert.deepEqual(parseContract(TaskEventSchema, event), event);
assert.deepEqual(parseContract(ApprovalDecisionSchema, { approvalId: 'apr_123', decision: 'reject', reason: 'Not expected' }).decision, 'reject');
assert.deepEqual(parseContract(ApiErrorSchema, { error: { code: 'NOT_FOUND', message: 'Task not found' } }).error.code, 'NOT_FOUND');

console.log('cloud contract tests: passed');
