// Connectors: how a host plugs its own services and third-party vendors into
// PlugChat instead of PlugChat replacing them.
//
//   - storage:  where uploaded files live (local disk by default; the host can
//               supply S3, Azure Blob, GCS... by implementing three methods)
//   - hooks:    decisions the host makes for us, as a function in the same
//               process or as a signed HTTP call to the host's backend in any
//               language. Used for billing ("does this user have credits?"),
//               moderation ("is this message allowed?") and call vendors
//               ("give this user a join token for room X").
import { createReadStream, mkdirSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { signWebhook } from './auth.js';

/** Default file storage: a directory on the host's own server. */
export function diskStorage(dir) {
  mkdirSync(dir, { recursive: true });
  return {
    put: (id, data) => writeFile(join(dir, id), data, { flag: 'wx' }),
    stream: (id) => createReadStream(join(dir, id)),
    remove: (id) => unlink(join(dir, id)).catch(() => {}),
  };
}

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/**
 * Sign a request the AWS way (Signature Version 4). Returns the headers to send.
 * Exported so it can be checked against AWS's published test vectors.
 */
export function signV4({ method, url, headers = {}, payloadHash, accessKeyId, secretAccessKey, region, service, now = new Date() }) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const all = { host: u.host, 'x-amz-date': amzDate, ...headers };
  const names = Object.keys(all).map((k) => k.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const query = [...u.searchParams.entries()].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join('&');
  const path = u.pathname.split('/').map((s) => encodeURIComponent(decodeURIComponent(s))).join('/');
  const canonical = [method, path, query, names.map((n) => `${n}:${lower[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service), 'aws4_request');
  const signature = hmac(key, toSign).toString('hex');
  return { ...lower, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

/**
 * Keep uploads in the host's own S3-compatible bucket (Amazon S3, Cloudflare
 * R2, MinIO, DigitalOcean Spaces, Backblaze B2...). No SDK needed, so it works
 * the same for platforms running PlugChat as a side service, configured purely
 * through settings.
 */
export function s3Storage({ bucket, region = 'us-east-1', endpoint, accessKeyId, secretAccessKey, prefix = '' }) {
  if (!bucket || !accessKeyId || !secretAccessKey) throw new Error('PlugChat: s3 storage needs bucket, accessKeyId and secretAccessKey');
  const base = (endpoint ? `${endpoint.replace(/\/+$/, '')}/${bucket}` : `https://${bucket}.s3.${region}.amazonaws.com`);
  const call = async (method, id, body) => {
    const url = `${base}/${prefix}${id}`;
    const payloadHash = sha256Hex(body ?? '');
    const headers = signV4({ method, url, headers: { 'x-amz-content-sha256': payloadHash }, payloadHash, accessKeyId, secretAccessKey, region, service: 's3' });
    delete headers.host; // fetch sets it
    const res = await fetch(url, { method, headers, body });
    if (!res.ok && !(method === 'DELETE' && res.status === 404)) throw new Error(`storage ${method} failed with ${res.status}`);
    return res;
  };
  return {
    put: (id, data) => call('PUT', id, data),
    stream: async (id) => Readable.fromWeb((await call('GET', id)).body),
    remove: (id) => call('DELETE', id),
  };
}

/** Build a storage adapter from plain settings, as a config file or environment variables provide them. */
export function storageFromConfig(config, dataDir) {
  if (!config || config.type === 'disk') return diskStorage(config?.dir ?? join(dataDir, 'files'));
  if (config.type === 's3') return s3Storage(config);
  throw new Error(`PlugChat: unknown storage type "${config.type}" (use "disk" or "s3")`);
}

/**
 * Lets several PlugChat instances that share one database behave as one:
 * an event raised on any instance reaches sockets connected to the others.
 * This default needs no extra infrastructure; it passes events through the
 * shared database, polling a few times a second.
 *
 * A host with Redis, NATS or similar can supply its own object with the same
 * shape: { publish(msg), subscribe(fn), setPresence?(userId, online),
 * isOnline?(userId), close?() }.
 */
export function databaseBus(store, { pollMs = 150 } = {}) {
  const instance = randomUUID();
  const STALE_MS = 45_000;
  let last = store.get('SELECT COALESCE(MAX(id), 0) AS id FROM bus').id;
  let handler = () => {};
  const guard = (fn) => () => {
    try {
      fn();
    } catch {
      // the database was closed while shutting down
    }
  };
  const poll = setInterval(guard(() => {
    for (const row of store.all('SELECT id, instance, payload FROM bus WHERE id > ? ORDER BY id', last)) {
      last = row.id;
      if (row.instance !== instance) handler(JSON.parse(row.payload));
    }
  }), pollMs);
  const beat = setInterval(guard(() => {
    const t = Date.now();
    store.run('UPDATE presence SET at = ? WHERE instance = ?', t, instance);
    store.run('DELETE FROM presence WHERE at < ?', t - STALE_MS); // instances that died without saying goodbye
    store.run('DELETE FROM bus WHERE at < ?', t - 60_000);
  }), 15_000);
  poll.unref();
  beat.unref();
  return {
    publish: (msg) => void store.run('INSERT INTO bus (instance, payload, at) VALUES (?, ?, ?)', instance, JSON.stringify(msg), Date.now()),
    subscribe: (fn) => void (handler = fn),
    setPresence(userId, online) {
      if (online) store.run('INSERT OR REPLACE INTO presence (user_id, instance, at) VALUES (?, ?, ?)', userId, instance, Date.now());
      else store.run('DELETE FROM presence WHERE user_id = ? AND instance = ?', userId, instance);
    },
    isOnline: (userId) => !!store.get('SELECT 1 FROM presence WHERE user_id = ? AND instance != ? AND at > ?', userId, instance, Date.now() - STALE_MS),
    close: guard(() => {
      clearInterval(poll);
      clearInterval(beat);
      store.run('DELETE FROM presence WHERE instance = ?', instance);
    }),
  };
}

export const HOOK_EVENTS = ['message.before', 'conversation.before', 'upload.before', 'call.join', 'link.preview'];

/**
 * Build `run(event, payload)`. Resolves to the host's answer, or `undefined`
 * when the host has not registered anything for that event.
 *
 * @param {object} cfg
 * @param {Record<string, Function>} [cfg.hooks]  In-process handlers keyed by event name.
 * @param {string} [cfg.hookUrl]                  Host endpoint for HTTP hooks.
 * @param {string[]} [cfg.hookEvents]             Which events to send to `hookUrl`.
 * @param {number} [cfg.hookTimeoutMs]
 * @param {string} cfg.secret                     Signs HTTP hook requests.
 */
export function createHooks({ hooks = {}, hookUrl, hookEvents = [], hookTimeoutMs = 4000, secret }) {
  for (const name of [...Object.keys(hooks), ...hookEvents]) {
    if (!HOOK_EVENTS.includes(name)) throw new Error(`PlugChat: unknown hook "${name}" (expected one of ${HOOK_EVENTS.join(', ')})`);
  }
  const remote = new Set(hookUrl ? hookEvents : []);

  const has = (event) => typeof hooks[event] === 'function' || remote.has(event);

  async function run(event, payload) {
    if (typeof hooks[event] === 'function') return (await hooks[event](payload)) ?? {};
    if (!remote.has(event)) return undefined;
    const body = JSON.stringify({ event, ...payload });
    const res = await fetch(hookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-plugchat-signature': signWebhook(body, secret) },
      body,
      signal: AbortSignal.timeout(hookTimeoutMs),
    });
    if (!res.ok) throw new Error(`hook ${event} answered ${res.status}`);
    const answer = await res.json();
    return answer && typeof answer === 'object' ? answer : {};
  }

  return { has, run };
}
