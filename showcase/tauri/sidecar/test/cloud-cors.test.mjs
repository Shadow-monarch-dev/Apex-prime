import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApiServer } from '../cloud/server.mjs';

const token = 'apex-cors-test-token-with-more-than-24';
const allowed = 'https://app.example.test';
const server = createApiServer({ token, allowedOrigins: [allowed] });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = 'http://127.0.0.1:' + server.address().port;
try {
  let response = await fetch(base + '/health', { headers: { origin: allowed } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), allowed);
  assert.equal(response.headers.get('vary'), 'Origin');

  response = await fetch(base + '/api/v1/sessions', {
    method: 'OPTIONS',
    headers: { origin: allowed, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), allowed);
  assert.match(response.headers.get('access-control-allow-headers'), /Authorization/i);

  response = await fetch(base + '/health', { headers: { origin: 'https://attacker.example' } });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'ORIGIN_NOT_ALLOWED');

  response = await fetch(base + '/api/v1/sessions', {
    method: 'OPTIONS',
    headers: { origin: 'https://attacker.example', 'access-control-request-method': 'POST' },
  });
  assert.equal(response.status, 403);
} finally {
  server.close();
  await once(server, 'close');
}
console.log('cloud CORS allowlist tests: passed');
