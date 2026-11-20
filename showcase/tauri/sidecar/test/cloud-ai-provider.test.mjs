import assert from 'node:assert/strict';
import { createChatProvider } from '../cloud/ai-provider.mjs';

let seen;
const provider = createChatProvider({
  apiKey: 'server-only-secret',
  model: 'test-chat-model',
  fetchImpl: async (url, options) => {
    seen = { url: String(url), options };
    return { ok: true, async json() { return { choices: [{ message: { content: '  APEX online.  ' } }] }; } };
  },
});
assert.equal(await provider.complete([{ role: 'user', content: 'Hello' }]), 'APEX online.');
assert.equal(seen.url, 'https://api.openai.com/v1/chat/completions');
assert.equal(seen.options.headers.authorization, 'Bearer server-only-secret');
assert.equal(JSON.parse(seen.options.body).model, 'test-chat-model');

assert.throws(() => createChatProvider({ apiKey: 'k', model: 'm', baseUrl: 'http://example.com/v1' }), /HTTPS/);
assert.throws(() => createChatProvider({ apiKey: 'k', model: 'm', baseUrl: 'https://user:pass@example.com/v1' }), /credentials/);

const limited = createChatProvider({
  apiKey: 'never-echo-this-key',
  model: 'test',
  fetchImpl: async () => ({ ok: false, status: 429 }),
});
await assert.rejects(() => limited.complete([]), (error) => error.status === 429 && !error.message.includes('never-echo-this-key'));
console.log('cloud AI provider tests: passed');
