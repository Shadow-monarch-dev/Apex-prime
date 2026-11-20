// Small authenticated client for connecting trusted APEX PRIME desktop runtimes to the cloud API.
// Tokens are supplied by the caller and are never persisted or logged by this module.
export function createApexApiClient({ baseUrl, token, fetchImpl = globalThis.fetch, timeoutMs = 30_000 } = {}) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) throw new Error('baseUrl is required');
  const parsed = new URL(baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
    throw new Error('APEX API must use HTTPS except for localhost development');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('baseUrl must not contain credentials, query, or fragment');
  if (typeof token !== 'string' || token.length < 24) throw new Error('A bearer token of at least 24 characters is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100) throw new Error('timeoutMs must be an integer >= 100');

  const root = parsed.toString().replace(/\/$/, '');
  async function request(path, { method = 'GET', body, signal } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('APEX API request timed out')), timeoutMs);
    const abort = () => controller.abort(signal.reason);
    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
    try {
      const response = await fetchImpl(root + path, {
        method,
        headers: { authorization: 'Bearer ' + token, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
        redirect: 'error',
      });
      let payload;
      try { payload = await response.json(); }
      catch { throw new Error('APEX API returned an invalid JSON response'); }
      if (!response.ok) {
        const error = new Error(payload?.error?.message || 'APEX API request failed');
        error.status = response.status;
        error.code = payload?.error?.code || 'API_ERROR';
        throw error;
      }
      return payload;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  return Object.freeze({
    health: () => fetchImpl(root + '/health', { headers: { accept: 'application/json' }, redirect: 'error' }).then(async (r) => {
      if (!r.ok) throw new Error('APEX API health check failed');
      return r.json();
    }),
    listSessions: (options) => request('/api/v1/sessions', options),
    createSession: (input = {}, options = {}) => request('/api/v1/sessions', { ...options, method: 'POST', body: input }),
    getSession: (id, options) => request('/api/v1/sessions/' + encodeURIComponent(id), options),
    listMessages: (sessionId, options) => request('/api/v1/sessions/' + encodeURIComponent(sessionId) + '/messages', options),
    addMessage: (sessionId, content, options = {}) => request('/api/v1/sessions/' + encodeURIComponent(sessionId) + '/messages', { ...options, method: 'POST', body: { content } }),
    chat: (sessionId, content, options = {}) => request('/api/v1/chat', { ...options, method: 'POST', body: { sessionId, content } }),
    listTasks: (sessionId, options) => request('/api/v1/tasks' + (sessionId ? '?sessionId=' + encodeURIComponent(sessionId) : ''), options),
    createTask: (input, options = {}) => request('/api/v1/tasks', { ...options, method: 'POST', body: input }),
    getTask: (id, options) => request('/api/v1/tasks/' + encodeURIComponent(id), options),
    getTaskEvents: (id, options) => request('/api/v1/tasks/' + encodeURIComponent(id) + '/events', options),
    decideApproval: (id, decision, reason, options = {}) => request('/api/v1/tasks/' + encodeURIComponent(id) + '/approval', { ...options, method: 'POST', body: { approvalId: id, decision, ...(reason ? { reason } : {}) } }),
  });
}
