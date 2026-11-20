// OpenAI-compatible chat provider. Credentials and endpoint are server configuration only;
// callers cannot supply API keys, URLs, or model names in request bodies.
export function createChatProvider({ apiKey, baseUrl = 'https://api.openai.com/v1', model, fetchImpl = fetch, timeoutMs = 60_000 } = {}) {
  if (!apiKey || typeof apiKey !== 'string') throw new Error('AI provider API key is required');
  if (!model || typeof model !== 'string') throw new Error('AI model name is required');
  const endpoint = new URL(baseUrl);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))) {
    throw new Error('AI provider URL must use HTTPS (HTTP is allowed only for localhost)');
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('AI provider URL must not contain credentials, query, or fragment');
  endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + '/chat/completions';

  return {
    model,
    async complete(messages) {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature: 0.4 }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const status = response.status;
        const e = new Error(status === 429 ? 'AI provider rate limit reached' : status >= 500 ? 'AI provider is temporarily unavailable' : 'AI provider rejected the configured credentials or request');
        e.status = status;
        throw e;
      }
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('AI provider returned an empty or unsupported response');
      return content.trim().slice(0, 100_000);
    },
  };
}
