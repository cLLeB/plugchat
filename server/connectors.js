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

export const HOOK_EVENTS = ['message.before', 'conversation.before', 'upload.before', 'call.join'];

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
