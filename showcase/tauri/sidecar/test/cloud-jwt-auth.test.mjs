import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createJwtAuthenticator } from '../cloud/jwt-auth.mjs';
import { createApiServer } from '../cloud/server.mjs';

const secret = 'a-test-signing-secret-with-more-than-32-bytes';
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(claims, header = { alg: 'HS256', typ: 'JWT' }, signingSecret = secret) {
  const input = b64(header) + '.' + b64(claims);
  return input + '.' + createHmac('sha256', signingSecret).update(input).digest('base64url');
}
const auth = createJwtAuthenticator({ secret });
const now = Math.floor(Date.now() / 1000);
const claims = { sub: 'owner-a', iss: 'apex-prime', aud: 'apex-prime-api', iat: now, exp: now + 300 };
assert.deepEqual(await auth('Bearer ' + jwt(claims)), { userId: 'owner-a' });
assert.equal(await auth('Bearer ' + jwt({ ...claims, exp: now - 60 })), null, 'expired token rejected');
assert.equal(await auth('Bearer ' + jwt({ ...claims, iss: 'other' })), null, 'wrong issuer rejected');
assert.equal(await auth('Bearer ' + jwt(claims, { alg: 'none', typ: 'JWT' })), null, 'algorithm confusion rejected');
assert.equal(await auth('Bearer ' + jwt(claims, undefined, 'attacker-secret-that-is-long-enough')), null, 'invalid signature rejected');
assert.equal(await auth('not-a-bearer-token'), null);

const server = createApiServer({ authenticate: auth });
server.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const request = (path, token) => fetch(base + path, { headers: { authorization: 'Bearer ' + token } });
try {
  const ownerA = jwt(claims);
  const ownerB = jwt({ ...claims, sub: 'owner-b' });
  let response = await fetch(base + '/api/v1/sessions', { method: 'POST', headers: { authorization: 'Bearer ' + ownerA, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'private A' }) });
  assert.equal(response.status, 201);
  const session = (await response.json()).session;
  response = await request('/api/v1/sessions/' + session.id, ownerB);
  assert.equal(response.status, 404, 'another user cannot read the session');
  response = await request('/api/v1/sessions', ownerB);
  assert.deepEqual((await response.json()).sessions, [], 'session list is tenant-scoped');
} finally {
  server.close();
  await new Promise((resolve) => server.once('close', resolve));
}
console.log('cloud JWT auth tests: passed');
