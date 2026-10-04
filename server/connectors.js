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
import { randomUUID } from 'node:crypto';
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
