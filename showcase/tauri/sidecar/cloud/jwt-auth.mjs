// Minimal HS256 JWT verifier for the API boundary. No token issuance or user signup is provided here.
import { createHmac, timingSafeEqual } from 'node:crypto';
const decode = (part) => Buffer.from(part, 'base64url').toString('utf8');
const signature = (input, secret) => createHmac('sha256', secret).update(input).digest();

export function createJwtAuthenticator({ secret, issuer = 'apex-prime', audience = 'apex-prime-api', clockToleranceSeconds = 30 } = {}) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('JWT secret must be at least 32 bytes');
  if (!issuer || !audience) throw new Error('JWT issuer and audience are required');
  return async function authenticate(authorization) {
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return null;
    const token = authorization.slice(7).trim();
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) return null;
    let header, claims;
    try { header = JSON.parse(decode(parts[0])); claims = JSON.parse(decode(parts[1])); } catch { return null; }
    if (header?.alg !== 'HS256' || header?.typ !== 'JWT') return null;
    const expected = signature(parts[0] + '.' + parts[1], secret);
    const actual = Buffer.from(parts[2], 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.sub !== 'string' || !claims.sub.trim() || claims.sub.length > 128) return null;
    if (claims.iss !== issuer || !(claims.aud === audience || (Array.isArray(claims.aud) && claims.aud.includes(audience)))) return null;
    if (!Number.isFinite(claims.exp) || claims.exp <= now - clockToleranceSeconds) return null;
    if (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + clockToleranceSeconds)) return null;
    return { userId: claims.sub };
  };
}
