import { createHmac, timingSafeEqual } from 'node:crypto';

const b64u = (v) => Buffer.from(v).toString('base64url');
const hmac = (data, secret) => createHmac('sha256', secret).update(data).digest();

/**
 * Sign an HS256 JWT. The host platform's backend does the equivalent of this
 * in whatever language it is written in; this helper exists for Node hosts,
 * the CLI and tests.
 */
export function signToken(claims, secret, ttlSeconds = 3600) {
  const iat = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify({ iat, exp: iat + ttlSeconds, ...claims }));
  const sig = b64u(hmac(`${header}.${payload}`, secret));
  return `${header}.${payload}.${sig}`;
}

/** Verify an HS256 JWT. Throws on anything other than a valid, unexpired token. */
export function verifyToken(token, secret) {
  if (typeof token !== 'string' || token.length > 4096) throw new Error('malformed token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [header, payload, sig] = parts;

  let head, claims;
  try {
    head = JSON.parse(Buffer.from(header, 'base64url').toString());
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    throw new Error('malformed token');
  }
  // Pin the algorithm: never let the token choose how it is verified.
  if (head.alg !== 'HS256') throw new Error('unsupported algorithm');

  const expected = hmac(`${header}.${payload}`, secret);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new Error('bad signature');
  }

  const nowSec = Date.now() / 1000;
  if (typeof claims.exp !== 'number') throw new Error('token has no exp');
  if (claims.exp <= nowSec) throw new Error('token expired');
  if (typeof claims.nbf === 'number' && claims.nbf > nowSec + 30) throw new Error('token not yet valid');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) {
    throw new Error('token has no valid sub');
  }
  return claims;
}

/** HMAC signature the host uses to authenticate webhooks we send it. */
export function signWebhook(body, secret) {
  return 'sha256=' + hmac(body, secret).toString('hex');
}
