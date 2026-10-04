import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { Hub } from './hub.js';
import { signToken, verifyToken, signWebhook } from './auth.js';
import { diskStorage, createHooks, databaseBus } from './connectors.js';

export { signToken, verifyToken, signWebhook, diskStorage, databaseBus };

const CLIENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'client');
const CLIENT_FILES = new Set(['plugchat.js', 'e2ee.js', 'calls.js', 'element.js', 'i18n.js', 'launcher.js', 'embed.js', 'admin.js']);
// The moderation console for the host's staff. It holds no secrets: it asks for an admin token.
const ADMIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Chat moderation</title>
<style>
:root { color-scheme: light dark; --bg: #f4f5f7; --card: #fff; --fg: #16181d; --muted: #6b7280; --line: #e3e5ea; --accent: #3b5bdb; --danger: #c92a2a; }
@media (prefers-color-scheme: dark) { :root { --bg: #111317; --card: #1b1e25; --fg: #e8eaee; --muted: #9199a6; --line: #2a2e37; --accent: #748ffc; --danger: #ff8787; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
#app { max-width: 880px; margin: 0 auto; padding: 20px 16px 60px; }
h1 { font-size: 22px; } h2 { font-size: 17px; margin: 0 0 10px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 16px; display: block; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 16px; }
.tile { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; }
.tile strong { font-size: 22px; } .tile span, .muted { color: var(--muted); font-size: 13px; }
.list { list-style: none; margin: 0; padding: 0; }
.list li { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; padding: 12px 0; border-top: 1px solid var(--line); flex-wrap: wrap; }
.list li > div:first-child { flex: 1; min-width: 240px; }
blockquote { margin: 8px 0; padding: 8px 12px; border-left: 3px solid var(--line); white-space: pre-wrap; overflow-wrap: anywhere; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.tag { display: inline-block; background: color-mix(in srgb, var(--accent) 16%, transparent); border-radius: 8px; padding: 1px 8px; font-size: 13px; margin-left: 4px; }
button { font: inherit; padding: 7px 12px; border-radius: 9px; border: 1px solid var(--line); background: var(--card); color: var(--fg); cursor: pointer; }
button.primary { background: var(--accent); color: #fff; border-color: transparent; margin-top: 10px; }
button.danger { color: var(--danger); } button:disabled { opacity: .5; }
input { font: inherit; width: 100%; box-sizing: border-box; padding: 9px 12px; border-radius: 9px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); }
.error { color: var(--danger); font-size: 13px; }
</style>
</head>
<body>
<main id="app"></main>
<script type="module" src="client/admin.js"></script>
</body>
</html>
`;
// The chat as a standalone page, for iframes and native WebViews.
const EMBED_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Messages</title>
<style>html, body { margin: 0; height: 100%; } plug-chat { height: 100%; --pc-radius: 0; }</style>
</head>
<body>
<plug-chat></plug-chat>
<script type="module" src="client/embed.js"></script>
</body>
</html>
`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_JSON = 256 * 1024;
const MAX_BODY_CHARS = 32_000;
const MAX_MEMBERS = 1000;
const HANDLE_KIND = /^[a-z][a-z0-9_]{0,23}$/;
const USER_KINDS = new Set(['text', 'poll', 'location', 'custom']);
const VIEW_ONCE_GRACE_MS = 60_000;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const bad = (message) => new HttpError(400, 'bad_request', message);
const forbidden = (message = 'not allowed') => new HttpError(403, 'forbidden', message);
const notFound = (what = 'not found') => new HttpError(404, 'not_found', what);

function str(value, field, max, { optional = false, allowEmpty = false } = {}) {
  if (value === undefined || value === null) {
    if (optional) return undefined;
    throw bad(`${field} is required`);
  }
  if (typeof value !== 'string') throw bad(`${field} must be a string`);
  if (value.length > max) throw bad(`${field} is too long (max ${max})`);
  if (!allowEmpty && !value.trim()) throw bad(`${field} must not be empty`);
  return value;
}

function idList(value, field) {
  if (!Array.isArray(value) || value.length === 0) throw bad(`${field} must be a non-empty array`);
  if (value.length > MAX_MEMBERS) throw bad(`${field} has too many entries`);
  return [...new Set(value.map((v) => str(v, field, 128)))];
}

function ttl(value) {
  if (value === null || value === 0) return null;
  if (!Number.isInteger(value) || value < 5 || value > 31_536_000) throw bad('ttlSeconds must be null or 5..31536000');
  return value;
}

function wrappedKey(value) {
  if (!value || typeof value !== 'object') throw bad('keys entries must be objects');
  return { by: str(value.by, 'keys.by', 128), byKey: str(value.byKey, 'keys.byKey', 256), data: str(value.data, 'keys.data', 512) };
}

function limiter(perSecond, burst) {
  const buckets = new Map();
  const take = (key) => {
    const t = Date.now();
    const b = buckets.get(key) ?? { n: burst, t };
    b.n = Math.min(burst, b.n + ((t - b.t) / 1000) * perSecond);
    b.t = t;
    buckets.set(key, b);
    if (b.n < 1) return false;
    b.n -= 1;
    return true;
  };
  take.prune = () => {
    const cutoff = Date.now() - 60_000;
    for (const [k, b] of buckets) if (b.t < cutoff) buckets.delete(k);
  };
  return take;
}

/**
 * Create a PlugChat instance.
 *
 * @param {object} options
 * @param {string} options.secret        Shared secret (>= 32 chars) the host signs user tokens with.
 * @param {string} [options.dataDir]     Where the SQLite file and uploads live. Default ./plugchat-data
 * @param {string} [options.basePath]    URL prefix. Default /plugchat
 * @param {string[]|'*'} [options.origins]  Browser origins allowed to call the API. Default '*'
 * @param {string} [options.webhookUrl]  Host endpoint that receives signed events (for push/email).
 * @param {boolean} [options.directory]  Let users search the user list. Default true
 * @param {number} [options.maxFileBytes] Upload limit. Default 10 MB
 */
export function createPlugChat(options = {}) {
  const {
    secret,
    dataDir = './plugchat-data',
    basePath = '/plugchat',
    origins = '*',
    webhookUrl,
    directory = true,
    maxFileBytes = 10 * 1024 * 1024,
    handleVisibility = 'none',
    stories = true,
    requireEncryption = false,
    iceServers = [{ urls: 'stun:stun.l.google.com:19302' }],
    rateLimit = { perSecond: 5, burst: 30 },
    storage: customStorage,
    hooks: hookFns,
    hookUrl,
    hookEvents,
    hookTimeoutMs,
    hookFailOpen = false,
    previousSecrets = [],
    maxTokenLifetimeSeconds = 86_400,
    cluster = false,
    bus: customBus,
    userStorageBytes = 0,
    log = console,
  } = options;

  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('PlugChat: `secret` must be a string of at least 32 characters');
  }
  const base = basePath.replace(/\/+$/, '');
  mkdirSync(dataDir, { recursive: true });
  const storage = customStorage ?? diskStorage(join(dataDir, 'files'));
  const hooks = createHooks({ hooks: hookFns, hookUrl, hookEvents, hookTimeoutMs, secret });
  // Calls go through the host's own vendor when it has registered one, peer-to-peer otherwise.
  const callMode = hooks.has('call.join') ? 'external' : 'p2p';
  const removeFile = (id) => Promise.resolve().then(() => storage.remove(id)).catch(() => {});

  const store = new Store(join(dataDir, 'plugchat.db'));
  const seen = new Map(); // sub -> "name\navatar" already written to the store
  const allowWrite = limiter(rateLimit.perSecond, rateLimit.burst);

  function verifyAny(token) {
    // During a secret rotation, tokens signed with the outgoing secret stay valid.
    let failure;
    for (const s of [secret, ...previousSecrets]) {
      try {
        return verifyToken(token, s);
      } catch (e) {
        failure ??= e;
        if (e.message !== 'bad signature') break;
      }
    }
    throw failure;
  }

  function authenticate(token) {
    const claims = verifyAny(token);
    // A long-lived token is a long-lived liability if it leaks.
    if (claims.exp - Date.now() / 1000 > maxTokenLifetimeSeconds) throw new Error(`token lifetime exceeds ${maxTokenLifetimeSeconds}s`);
    if (claims.admin === true) return claims;
    const name = typeof claims.name === 'string' ? claims.name.slice(0, 120) : undefined;
    const avatar = typeof claims.avatar === 'string' && /^https?:\/\//.test(claims.avatar) ? claims.avatar.slice(0, 500) : undefined;
    // However the platform identifies its people, it can pass that along:
    // { email, phone, username } or any custom kinds under `handles`.
    const handles = {};
    for (const k of ['email', 'phone', 'username']) if (typeof claims[k] === 'string') handles[k] = claims[k];
    if (claims.handles && typeof claims.handles === 'object') {
      for (const [k, v] of Object.entries(claims.handles).slice(0, 8)) if (HANDLE_KIND.test(k) && typeof v === 'string') handles[k] = v;
    }
    const sig = `${name}\n${avatar}\n${JSON.stringify(handles)}`;
    if (seen.get(claims.sub) !== sig) {
      store.upsertUser(claims.sub, name, avatar);
      // A token without handles leaves handles set by the admin API untouched.
      if (Object.keys(handles).length) {
        const taken = store.setHandles(claims.sub, handles);
        if (taken.length) log.error(`plugchat: ${taken.join(', ')} of user "${claims.sub}" already belongs to another user; skipped`);
      }
      seen.set(claims.sub, sig);
    }
    return claims;
  }

  const userView = (user, auth) => ({
    ...user,
    online: hub.isOnline(user.id) && (auth.admin || auth.sub === user.id || store.privacy(user.id).presence),
    // "Last seen" follows the same switch as online status.
    lastSeen: auth.admin || auth.sub === user.id || store.privacy(user.id).presence ? user.lastSeen : null,
    suspended: auth.admin ? store.suspension(user.id) : undefined,
    handles: auth.admin || auth.sub === user.id || handleVisibility === 'all' ? store.handlesOf(user.id) : undefined,
  });

  const allowOrigin = (origin) => !origin || origins === '*' || origins.includes(origin);
  const bus = customBus ?? (cluster ? databaseBus(store) : undefined);
  const hub = new Hub({ store, authenticate, allowOrigin, bus });

  const sweeper = setInterval(() => {
    try {
      const gone = store.sweepExpired();
      for (const m of gone) {
        hub.emit(store.memberIds(m.conversationId), { type: 'message.deleted', conversationId: m.conversationId, messageId: m.id, expired: true });
        if (m.fileId) removeFile(m.fileId);
      }
      for (const m of store.sweepViewOnce(VIEW_ONCE_GRACE_MS)) {
        hub.emit(store.memberIds(m.conversationId), { type: 'message.updated', message: store.getMessage(m.id) });
        if (m.fileId) removeFile(m.fileId);
      }
      const dead = [...store.sweepStories(), ...store.sweepOrphanFiles(24 * 3600_000)];
      for (const fileId of dead) removeFile(fileId);
      allowWrite.prune();
    } catch (e) {
      log.error('plugchat sweep failed', e);
    }
  }, 5000);
  sweeper.unref();

  /**
   * Ask the host. No registered hook means yes. A hook that says
   * { allow: false, reason } turns into a 403 the user sees; a hook that is
   * down blocks the action unless the host opted into hookFailOpen.
   */
  async function gate(event, payload) {
    let verdict;
    try {
      verdict = await hooks.run(event, payload);
    } catch (e) {
      log.error(`plugchat hook ${event} failed:`, e.message);
      if (hookFailOpen) return {};
      throw new HttpError(502, 'hook_unavailable', 'this action cannot be completed right now');
    }
    if (verdict?.allow === false) throw new HttpError(403, 'rejected', typeof verdict.reason === 'string' ? verdict.reason.slice(0, 300) : 'not allowed');
    return verdict ?? {};
  }

  async function joinCall(call, userId, memberIds) {
    const answer = await gate('call.join', {
      call,
      userId,
      user: store.getUser(userId),
      isStarter: call.startedBy === userId,
      memberIds,
    });
    const url = typeof answer.url === 'string' && /^https:\/\/|^http:\/\/localhost[:/]/.test(answer.url) ? answer.url : undefined;
    if (!url && answer.data === undefined) throw new HttpError(502, 'hook_unavailable', 'the call provider returned nothing to join with');
    return { url, data: answer.data };
  }

  function webhook(event) {
    if (!webhookUrl) return;
    const body = JSON.stringify(event);
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-plugchat-signature': signWebhook(body, secret) },
      body,
      signal: AbortSignal.timeout(5000),
    }).catch((e) => log.error('plugchat webhook failed:', e.message));
  }

  /** Push each member their own view of a conversation (unread counts and keys differ per user). */
  function pushConversation(id, type = 'conversation.updated') {
    for (const uid of store.memberIds(id)) {
      if (hub.isOnline(uid)) hub.emit([uid], { type, conversation: store.conversationFor(id, uid) });
    }
  }

  // Unknown and not-yours look identical so conversation ids can't be probed.
  function access(ctx, id) {
    const conv = store.rawConversation(id);
    const member = conv && store.member(id, ctx.auth.sub);
    if (!conv || (!member && !ctx.auth.admin)) throw notFound('conversation not found');
    return { conv, member };
  }

  function messageAccess(ctx, id) {
    const message = store.getMessage(id);
    if (!message) throw notFound('message not found');
    try {
      return { message, ...access(ctx, message.conversationId) };
    } catch {
      throw notFound('message not found');
    }
  }

  function requireUsers(ids) {
    for (const id of ids) if (!store.getUser(id)) throw new HttpError(404, 'user_not_found', `unknown user "${id}" (provision users with PUT /v1/users/:id)`);
  }

  /**
   * Validate wrapped conversation keys sent by a client. Every key must be for
   * a registered device of a conversation member; `mustCover` lists the people
   * who need at least one, so nobody is added to a chat they cannot read.
   */
  function memberKeys(memberIds, keys, { epoch, maxEpoch, mustCover = [] } = {}) {
    if (!Array.isArray(keys) || keys.length > 10_000) throw bad('keys must be an array');
    const members = new Set(memberIds);
    const out = keys.map((k) => {
      const key = { userId: str(k?.userId, 'keys.userId', 128), deviceId: str(k.deviceId, 'keys.deviceId', 64), epoch: epoch ?? k.epoch, ...wrappedKey(k) };
      if (!Number.isInteger(key.epoch) || key.epoch < 1 || (maxEpoch && key.epoch > maxEpoch)) throw bad('keys.epoch is out of range');
      if (!members.has(key.userId) || !store.hasDevice(key.userId, key.deviceId)) throw bad('keys must be for devices of conversation members');
      return key;
    });
    for (const id of mustCover) {
      if (!store.devicesOf(id).length) throw new HttpError(409, 'no_public_key', `user "${id}" has not set up encryption yet`);
      if (!out.some((k) => k.userId === id)) throw bad(`missing wrapped key for "${id}"`);
    }
    return out;
  }

  // Ciphertext is "e1.<key epoch>.<data>". The server cannot read it, but it can
  // insist on the current key, which is what locks out people who have left.
  function checkCipher(conv, body) {
    const epoch = /^e1\.(\d{1,9})\./.exec(body)?.[1];
    if (!epoch) throw bad('this conversation only accepts encrypted messages');
    if (conv.rotate_pending) throw new HttpError(409, 'rotation_required', 'the conversation key must be replaced before sending');
    if (Number(epoch) !== conv.key_epoch) throw new HttpError(409, 'stale_epoch', 'the conversation key has changed; refresh and resend');
  }
  const adminOnly = (ctx) => {
    if (!ctx.auth.admin) throw forbidden('admin token required');
  };

  const routes = [
    ['GET', '/v1/me', (ctx) => ({ ...userView(store.getUser(ctx.auth.sub), ctx.auth), privacy: store.privacy(ctx.auth.sub), suspended: store.suspension(ctx.auth.sub), directory, features: { directory, stories, requireEncryption, calls: callMode } })],

    ['GET', '/v1/ice', () => ({ iceServers })],

    // Find someone by whatever identifier the platform uses. Exact match only,
    // so the directory can't be harvested by guessing prefixes.
    ['GET', '/v1/users/lookup', (ctx) => {
      const q = ctx.url.searchParams;
      const value = str(q.get('handle') ?? q.get('value'), 'handle', 254);
      const kind = q.get('kind') ?? undefined;
      if (kind !== undefined && !HANDLE_KIND.test(kind)) throw bad('invalid kind');
      const user = store.findByHandle(value, kind);
      if (!user) throw notFound('user not found');
      return userView(user, ctx.auth);
    }],

    // Each browser or phone registers its own key. Other members' devices then
    // hand it the conversation keys, so a new device can read existing chats.
    ['PUT', '/v1/me/key', async (ctx) => {
      const b = await ctx.json();
      const fresh = store.registerDevice(ctx.auth.sub, str(b.deviceId, 'deviceId', 64), str(b.publicKey, 'publicKey', 256));
      if (fresh) for (const id of store.encryptedConversationIds(ctx.auth.sub)) pushConversation(id);
      return { ...userView(store.getUser(ctx.auth.sub), ctx.auth), privacy: store.privacy(ctx.auth.sub), suspended: store.suspension(ctx.auth.sub), directory, features: { directory, stories, requireEncryption, calls: callMode } };
    }],

    ['GET', '/v1/me/devices', (ctx) => ({ devices: store.devicesOf(ctx.auth.sub) })],
    ['DELETE', '/v1/me/devices/:deviceId', (ctx) => {
      if (!store.removeDevice(ctx.auth.sub, ctx.params.deviceId)) throw notFound('device not found');
      for (const id of store.encryptedConversationIds(ctx.auth.sub)) pushConversation(id);
      return { removed: true };
    }],
    ['GET', '/v1/users', (ctx) => {
      if (!directory && !ctx.auth.admin) throw forbidden('user directory is disabled');
      const users = store.searchUsers(ctx.url.searchParams.get('q') ?? '', ctx.auth.sub);
      return { users: users.map((u) => userView(u, ctx.auth)) };
    }],

    // Needed to set up encryption with someone before any conversation exists.
    // Reveals nothing beyond what starting a chat with that id already would.
    ['GET', '/v1/users/:id/devices', (ctx) => {
      if (!store.getUser(ctx.params.id)) throw notFound('user not found');
      return { devices: store.devicesOf(ctx.params.id).map(({ deviceId, publicKey }) => ({ deviceId, publicKey })) };
    }],

    ['GET', '/v1/users/:id', (ctx) => {
      const user = store.getUser(ctx.params.id);
      // With the directory off, ids can't be probed: you only see people you already share a chat with.
      const visible = directory || ctx.auth.admin || user?.id === ctx.auth.sub || (user && store.peers(ctx.auth.sub).includes(user.id));
      if (!user || !visible) throw notFound('user not found');
      return userView(user, ctx.auth);
    }],

    ['PUT', '/v1/users/:id', async (ctx) => {
      adminOnly(ctx);
      const b = await ctx.json();
      const id = str(ctx.params.id, 'id', 128);
      if (b.handles !== undefined) {
        if (!b.handles || typeof b.handles !== 'object') throw bad('handles must be an object of kind -> value');
        for (const [k, v] of Object.entries(b.handles)) if (!HANDLE_KIND.test(k) || typeof v !== 'string') throw bad(`invalid handle "${k}"`);
        // Check before writing anything, so a refused request leaves no half-made user behind.
        const taken = Object.entries(b.handles).filter(([k, v]) => {
          const holder = store.findByHandle(v, k);
          return holder && holder.id !== id;
        }).map(([k]) => k);
        if (taken.length) throw new HttpError(409, 'handle_taken', `already used by another user: ${taken.join(', ')}`);
      }
      seen.delete(id);
      store.upsertUser(id, str(b.name, 'name', 120, { optional: true }), str(b.avatar, 'avatar', 500, { optional: true }));
      if (b.handles !== undefined) store.setHandles(id, b.handles);
      return userView(store.getUser(id), ctx.auth);
    }],

    ['DELETE', '/v1/users/:id', async (ctx) => {
      adminOnly(ctx);
      const peers = store.peers(ctx.params.id);
      const groups = store.all("SELECT conversation_id AS id FROM members m JOIN conversations c ON c.id = m.conversation_id WHERE m.user_id = ? AND c.type = 'group'", ctx.params.id);
      const files = store.deleteUser(ctx.params.id);
      seen.delete(ctx.params.id);
      hub.disconnect(ctx.params.id);
      await Promise.all(files.map((f) => removeFile(f)));
      for (const g of groups) pushConversation(g.id);
      hub.emit(peers, { type: 'user.deleted', userId: ctx.params.id });
      return { deleted: true };
    }],

    // A person's own data on request; the host can fetch anyone's with an admin token.
    ['GET', '/v1/me/export', (ctx) => store.exportUser(ctx.auth.sub)],
    ['GET', '/v1/users/:id/export', (ctx) => {
      adminOnly(ctx);
      const data = store.exportUser(ctx.params.id);
      if (!data) throw notFound('user not found');
      return data;
    }],

    ['GET', '/v1/blocks', (ctx) => ({ blocked: store.blocks(ctx.auth.sub) })],
    ['PUT', '/v1/blocks/:id', (ctx) => (store.block(ctx.auth.sub, ctx.params.id), { blocked: store.blocks(ctx.auth.sub) })],
    ['DELETE', '/v1/blocks/:id', (ctx) => (store.unblock(ctx.auth.sub, ctx.params.id), { blocked: store.blocks(ctx.auth.sub) })],

    ['GET', '/v1/conversations', (ctx) => ({ conversations: store.listConversations(ctx.auth.sub) })],

    ['POST', '/v1/conversations', async (ctx) => {
      const b = await ctx.json();
      const { auth } = ctx;
      if (b.type !== 'dm' && b.type !== 'group') throw bad('type must be "dm" or "group"');
      const creator = auth.admin ? str(b.createdBy, 'createdBy', 128, { optional: true }) ?? auth.sub : auth.sub;
      const memberIds = [...new Set([...(auth.admin ? [] : [auth.sub]), ...idList(b.memberIds, 'memberIds')])];
      requireUsers(memberIds);

      if (b.type === 'dm') {
        if (memberIds.length !== 2) throw bad('a dm needs exactly one other user');
        const existing = store.findDm(memberIds[0], memberIds[1]);
        if (existing) return store.conversationFor(existing, auth.sub);
        if (!auth.admin && store.isBlocked(auth.sub, memberIds.find((id) => id !== auth.sub))) throw forbidden('you cannot message this user');
      }

      const encrypted = b.encrypted === true;
      if (requireEncryption && !encrypted && !auth.admin) throw bad('this platform requires end-to-end encrypted conversations');
      const id = b.id === undefined ? undefined : str(b.id, 'id', 36);
      if (id !== undefined && (!UUID.test(id) || store.conversationExists(id))) throw bad('id must be an unused UUID');
      if (!auth.admin) await gate('conversation.before', { type: b.type, creatorId: creator, memberIds, encrypted });
      const cid = store.createConversation({
        id,
        type: b.type,
        title: b.type === 'group' ? str(b.title, 'title', 120) : null,
        creator,
        memberIds,
        encrypted,
        ttlSeconds: b.ttlSeconds === undefined ? null : ttl(b.ttlSeconds),
        keys: encrypted ? memberKeys(memberIds, b.keys, { epoch: 1, mustCover: memberIds }) : null,
        announce: b.type === 'group' && b.announce === true,
        description: str(b.description, 'description', 500, { optional: true, allowEmpty: true }),
      });
      pushConversation(cid, 'conversation.new');
      ctx.status = 201;
      return store.conversationFor(cid, auth.sub);
    }],

    ['GET', '/v1/conversations/:id', (ctx) => {
      access(ctx, ctx.params.id);
      return store.conversationFor(ctx.params.id, ctx.auth.sub);
    }],

    ['PATCH', '/v1/conversations/:id', async (ctx) => {
      const { conv, member } = access(ctx, ctx.params.id);
      const b = await ctx.json();
      const patch = {};
      if (b.title !== undefined) {
        if (conv.type !== 'group') throw bad('only groups have titles');
        if (!ctx.auth.admin && member.role === 'member') throw forbidden('only group admins can rename');
        patch.title = str(b.title, 'title', 120);
      }
      if (b.ttlSeconds !== undefined) {
        if (!ctx.auth.admin && conv.type === 'group' && member.role === 'member') throw forbidden('only group admins can change the timer');
        patch.ttlSeconds = ttl(b.ttlSeconds);
      }
      if (b.announce !== undefined || b.description !== undefined) {
        if (conv.type !== 'group') throw bad('only groups have these settings');
        if (!ctx.auth.admin && member.role === 'member') throw forbidden('only group admins can change group settings');
        if (b.announce !== undefined) patch.announce = b.announce === true;
        if (b.description !== undefined) patch.description = str(b.description, 'description', 500, { allowEmpty: true });
      }
      store.updateConversation(conv.id, patch);
      pushConversation(conv.id);
      return store.conversationFor(conv.id, ctx.auth.sub);
    }],

    // Mute, archive, pin: private to the member who sets them.
    ['PUT', '/v1/conversations/:id/settings', async (ctx) => {
      const { conv, member } = access(ctx, ctx.params.id);
      if (!member) throw forbidden();
      const b = await ctx.json();
      const pick = (k) => (b[k] === undefined ? undefined : b[k] === true);
      store.setMemberSettings(conv.id, ctx.auth.sub, { muted: pick('muted'), archived: pick('archived'), pinned: pick('pinned') });
      const view = store.conversationFor(conv.id, ctx.auth.sub);
      hub.emit([ctx.auth.sub], { type: 'conversation.updated', conversation: view });
      return view;
    }],

    // Invite codes. Not offered for encrypted groups: a newcomer needs the
    // conversation key handed over by an existing member, which a code cannot do.
    ['POST', '/v1/conversations/:id/invites', async (ctx) => {
      const { conv, member } = access(ctx, ctx.params.id);
      if (conv.type !== 'group') throw bad('only groups have invites');
      if (conv.encrypted) throw bad('encrypted groups cannot be joined by invite code; add members directly');
      if (!ctx.auth.admin && member.role === 'member') throw forbidden('only group admins can create invites');
      const b = await ctx.json();
      const maxUses = b.maxUses === undefined || b.maxUses === null ? null : b.maxUses;
      if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > MAX_MEMBERS)) throw bad('maxUses must be a positive integer');
      const invite = store.addInvite({
        code: randomBytes(9).toString('base64url'),
        conversationId: conv.id,
        createdBy: ctx.auth.sub,
        ttlSeconds: b.ttlSeconds === undefined ? 7 * 86_400 : ttl(b.ttlSeconds),
        maxUses,
      });
      ctx.status = 201;
      return invite;
    }],

    ['GET', '/v1/conversations/:id/invites', (ctx) => {
      const { conv, member } = access(ctx, ctx.params.id);
      if (!ctx.auth.admin && member.role === 'member') throw forbidden('only group admins can see invites');
      return { invites: store.listInvites(conv.id) };
    }],

    ['DELETE', '/v1/conversations/:id/invites/:code', (ctx) => {
      const { conv, member } = access(ctx, ctx.params.id);
      if (!ctx.auth.admin && member.role === 'member') throw forbidden('only group admins can revoke invites');
      if (!store.deleteInvite(ctx.params.code, conv.id)) throw notFound('invite not found');
      return { revoked: true };
    }],

    ['GET', '/v1/invites/:code', (ctx) => {
      const invite = store.getInvite(ctx.params.code);
      const conv = invite && store.rawConversation(invite.conversationId);
      if (!conv) throw notFound('this invite is not valid any more');
      return { title: conv.title, description: conv.description, memberCount: store.memberIds(conv.id).length, alreadyMember: !!store.member(conv.id, ctx.auth.sub) };
    }],

    ['POST', '/v1/invites/:code/join', (ctx) => {
      const invite = store.getInvite(ctx.params.code);
      const conv = invite && store.rawConversation(invite.conversationId);
      if (!conv) throw notFound('this invite is not valid any more');
      if (!store.member(conv.id, ctx.auth.sub)) {
        if (store.memberIds(conv.id).length >= MAX_MEMBERS) throw bad('group is full');
        store.addMembers(conv.id, [ctx.auth.sub]);
        store.useInvite(invite.code);
        pushConversation(conv.id);
      }
      return store.conversationFor(conv.id, ctx.auth.sub);
    }],

    // Hand existing conversation keys to member devices that lack them (a
    // person's new phone, or someone just added). Never overwrites.
    ['POST', '/v1/conversations/:id/keys', async (ctx) => {
      const { conv, member } = access(ctx, ctx.params.id);
      if (!conv.encrypted || !member) throw bad('not an encrypted conversation you belong to');
      const keys = memberKeys(store.memberIds(conv.id), (await ctx.json()).keys, { maxEpoch: conv.key_epoch });
      store.addMemberKeys(conv.id, keys);
      for (const uid of new Set(keys.map((k) => k.userId))) {
        if (hub.isOnline(uid)) hub.emit([uid], { type: 'conversation.updated', conversation: store.conversationFor(conv.id, uid) });
      }
      return store.conversationFor(conv.id, ctx.auth.sub);
    }],

    // Replace the conversation key. Required after someone leaves, so they
    // cannot read what is said next; any member may also do it at will.
    ['POST', '/v1/conversations/:id/rotate', async (ctx) => {
      const { conv, member } = access(ctx, ctx.params.id);
      if (!conv.encrypted || !member) throw bad('not an encrypted conversation you belong to');
      const b = await ctx.json();
      const memberIds = store.memberIds(conv.id);
      const keys = memberKeys(memberIds, b.keys, { epoch: b.epoch, mustCover: [ctx.auth.sub] });
      if (!store.rotateKey(conv.id, b.epoch, keys)) throw new HttpError(409, 'stale_epoch', 'someone else already replaced the key; refresh');
      pushConversation(conv.id);
      return store.conversationFor(conv.id, ctx.auth.sub);
    }],
    ['GET', '/v1/conversations/:id/pins', (ctx) => {
      access(ctx, ctx.params.id);
      return { messages: store.listPins(ctx.params.id) };
    }],

    ['GET', '/v1/search', (ctx) => {
      const q = str(ctx.url.searchParams.get('q'), 'q', 200);
      if (q.trim().length < 2) throw bad('q must be at least 2 characters');
      const conversationId = ctx.url.searchParams.get('conversationId') ?? undefined;
      if (conversationId) access(ctx, conversationId);
      return { messages: store.search(ctx.auth.sub, q.trim(), conversationId) };
    }],

    ['POST', '/v1/conversations/:id/members', async (ctx) => {
      const { conv, member } = access(ctx, ctx.params.id);
      if (conv.type !== 'group') throw bad('cannot add members to a dm');
      if (!ctx.auth.admin && member.role === 'member') throw forbidden('only group admins can add members');
      const b = await ctx.json();
      const current = new Set(store.memberIds(conv.id));
      const userIds = idList(b.userIds, 'userIds').filter((id) => !current.has(id));
      if (current.size + userIds.length > MAX_MEMBERS) throw bad('group is full');
      requireUsers(userIds);
      store.addMembers(conv.id, userIds, conv.encrypted ? memberKeys([...current, ...userIds], b.keys, { maxEpoch: conv.key_epoch, mustCover: userIds }) : null);
      pushConversation(conv.id);
      return store.conversationFor(conv.id, ctx.auth.sub);
    }],

    ['PATCH', '/v1/conversations/:id/members/:uid', async (ctx) => {
      const { conv, member } = access(ctx, ctx.params.id);
      if (!ctx.auth.admin && member.role !== 'owner') throw forbidden('only the owner can change roles');
      const { role } = await ctx.json();
      if (!['owner', 'admin', 'member'].includes(role)) throw bad('role must be "owner", "admin" or "member"');
      const target = store.member(conv.id, ctx.params.uid);
      if (!target || target.role === 'owner') throw bad('cannot change that member');
      // Handing over ownership: the previous owner stays on as an admin.
      if (role === 'owner') for (const id of store.memberIds(conv.id)) if (store.member(conv.id, id).role === 'owner') store.setRole(conv.id, id, 'admin');
      store.setRole(conv.id, ctx.params.uid, role);
      pushConversation(conv.id);
      return store.conversationFor(conv.id, ctx.auth.sub);
    }],

    ['DELETE', '/v1/conversations/:id/members/:uid', async (ctx) => {
      const { conv, member } = access(ctx, ctx.params.id);
      if (conv.type !== 'group') throw bad('cannot leave a dm');
      const uid = ctx.params.uid;
      const target = store.member(conv.id, uid);
      if (!target) throw notFound('member not found');
      const self = uid === ctx.auth.sub;
      if (!self && !ctx.auth.admin) {
        if (member.role === 'member') throw forbidden('only group admins can remove members');
        if (target.role === 'owner') throw forbidden('the owner cannot be removed');
      }
      store.removeMember(conv.id, uid);
      hub.emit([uid], { type: 'conversation.removed', conversationId: conv.id });
      const left = store.all('SELECT user_id, role FROM members WHERE conversation_id = ? ORDER BY joined_at', conv.id);
      if (left.length === 0) {
        const files = store.all('SELECT id FROM files WHERE conversation_id = ?', conv.id);
        store.run('DELETE FROM conversations WHERE id = ?', conv.id);
        await Promise.all(files.map((f) => removeFile(f.id)));
      } else {
        if (!left.some((m) => m.role === 'owner')) store.setRole(conv.id, left[0].user_id, 'owner');
        pushConversation(conv.id);
      }
      return { removed: true };
    }],

    ['GET', '/v1/conversations/:id/messages', (ctx) => {
      access(ctx, ctx.params.id);
      const q = ctx.url.searchParams;
      const num = (name) => {
        if (!q.has(name)) return undefined;
        const v = Number(q.get(name));
        if (!Number.isInteger(v) || v < 0) throw bad(`${name} must be a message seq`);
        return v;
      };
      const limit = Math.min(Math.max(Number(q.get('limit')) || 50, 1), 200);
      const page = (range) => store.listMessages(ctx.params.id, { ...range, limit, userId: ctx.auth.sub });
      const around = num('around');
      // `around` returns the messages either side of one, for jumping into the middle of a long history.
      if (around !== undefined) {
        const half = Math.ceil(limit / 2);
        return { messages: [...store.listMessages(ctx.params.id, { before: around + 1, limit: half, userId: ctx.auth.sub }), ...store.listMessages(ctx.params.id, { after: around, limit: half, userId: ctx.auth.sub })] };
      }
      return { messages: page({ before: num('before'), after: num('after') }) };
    }],

    ['GET', '/v1/messages/:id', (ctx) => {
      const { message } = messageAccess(ctx, ctx.params.id);
      return { ...message, starred: store._starred(ctx.auth.sub, [message.id]).has(message.id) };
    }],

    ['PUT', '/v1/messages/:id/star', (ctx) => star(ctx, true)],
    ['DELETE', '/v1/messages/:id/star', (ctx) => star(ctx, false)],
    ['GET', '/v1/starred', (ctx) => ({ messages: store.listStarred(ctx.auth.sub) })],

    // What others may see about the caller.
    ['PUT', '/v1/me/settings', async (ctx) => {
      const b = await ctx.json();
      const pick = (k) => (b[k] === undefined ? undefined : b[k] === true);
      const before = store.privacy(ctx.auth.sub);
      const privacy = store.setPrivacy(ctx.auth.sub, { readReceipts: pick('readReceipts'), presence: pick('presence') });
      if (before.presence !== privacy.presence && hub.isOnline(ctx.auth.sub)) {
        hub.emit(store.peers(ctx.auth.sub), { type: 'presence', userId: ctx.auth.sub, online: privacy.presence });
      }
      return { privacy };
    }],
    ['POST', '/v1/conversations/:id/messages', async (ctx) => {
      const { conv, member } = access(ctx, ctx.params.id);
      const b = await ctx.json();
      const { auth } = ctx;
      if (b.kind !== undefined && !USER_KINDS.has(b.kind) && !(auth.admin && b.kind === 'system')) throw bad('unknown kind');
      const kind = b.kind ?? (auth.admin ? 'system' : 'text');
      if (conv.announce && !auth.admin && member.role === 'member') throw forbidden('only admins can post in this channel');
      const senderId = auth.admin && b.senderId ? str(b.senderId, 'senderId', 128) : auth.sub;

      const clientId = str(b.clientId, 'clientId', 64, { optional: true });
      if (clientId) {
        const dup = store.findByClientId(conv.id, senderId, clientId);
        if (dup) return dup;
      }

      let attachment = null;
      if (b.attachment) {
        const file = store.getFile(str(b.attachment.fileId, 'attachment.fileId', 36));
        if (!file || file.conversationId !== conv.id || file.messageId || (file.ownerId !== auth.sub && !auth.admin)) throw bad('unknown attachment');
        attachment = { fileId: file.id, name: file.name, mime: file.mime, size: file.size };
      }
      let body = str(b.body ?? '', 'body', MAX_BODY_CHARS, { allowEmpty: !!attachment });
      // Refuse plaintext in an encrypted conversation so a buggy client can't leak content.
      if (conv.encrypted && kind !== 'system') checkCipher(conv, body);

      const meta = {};
      const viewOnce = b.viewOnce === true;
      if (viewOnce && kind !== 'text') throw bad('only text and media messages can be view-once');
      if (b.forwarded === true) meta.forwarded = true;
      if (kind === 'poll') {
        const n = b.poll?.options;
        if (!Number.isInteger(n) || n < 2 || n > 12) throw bad('poll.options must be the number of choices (2..12)');
        meta.poll = { options: n, multi: b.poll.multi === true };
      }
      // The server can only check the shape of content it is able to read.
      if (!conv.encrypted && kind !== 'text' && kind !== 'system') {
        let v;
        try {
          v = JSON.parse(body);
        } catch {
          throw bad(`${kind} body must be JSON`);
        }
        const ok = kind === 'custom'
          ? typeof v?.type === 'string' && v.type.length <= 64
          : kind === 'poll'
          ? typeof v?.question === 'string' && Array.isArray(v.options) && v.options.length === meta.poll.options && v.options.every((o) => typeof o === 'string' && o.trim())
          : Number.isFinite(v?.lat) && Number.isFinite(v?.lng) && Math.abs(v.lat) <= 90 && Math.abs(v.lng) <= 180;
        if (!ok) throw bad(`malformed ${kind}`);
      }

      let replyTo = null;
      if (b.replyTo) {
        const parent = store.getMessage(str(b.replyTo, 'replyTo', 36));
        if (!parent || parent.conversationId !== conv.id) throw bad('replyTo is not in this conversation');
        replyTo = parent.id;
      }

      const memberIds = store.memberIds(conv.id);
      if (conv.type === 'dm' && !auth.admin) {
        const other = memberIds.find((id) => id !== auth.sub);
        if (store.isBlocked(auth.sub, other)) throw forbidden('you cannot message this user');
      }

      if (b.mentions !== undefined) {
        const members = new Set(memberIds);
        meta.mentions = idList(b.mentions, 'mentions').filter((id) => members.has(id));
      }

      // The host may veto or rewrite: credit checks, moderation services, compliance rules.
      if (!auth.admin) {
        const verdict = await gate('message.before', {
          message: { conversationId: conv.id, senderId, kind, body, hasAttachment: !!attachment, mentions: meta.mentions ?? [], viewOnce },
          conversation: { id: conv.id, type: conv.type, encrypted: !!conv.encrypted, memberCount: memberIds.length },
        });
        if (typeof verdict.body === 'string' && !conv.encrypted && kind === 'text') body = str(verdict.body, 'body', MAX_BODY_CHARS, { allowEmpty: !!attachment });
      }

      const message = store.insertMessage({ conversationId: conv.id, senderId, kind, body, replyTo, attachment, clientId, meta, viewOnce });
      hub.emit(memberIds, { type: 'message.new', message });
      // Everything the host needs to send its own push notification or email.
      const muted = new Set(store.mutedIds(conv.id));
      webhook({
        type: 'message.new',
        message,
        conversation: { id: conv.id, type: conv.type, title: conv.title, encrypted: !!conv.encrypted },
        recipients: memberIds.filter((id) => id !== senderId).map((id) => ({
          userId: id, online: hub.isOnline(id), muted: muted.has(id), mentioned: message.mentions.includes(id),
        })),
      });
      ctx.status = 201;
      return message;
    }],

    ['POST', '/v1/conversations/:id/read', async (ctx) => {
      const { conv, member } = access(ctx, ctx.params.id);
      if (!member) throw forbidden();
      const { seq } = await ctx.json();
      if (!Number.isInteger(seq) || seq < 0) throw bad('seq must be a non-negative integer');
      if (store.markRead(conv.id, ctx.auth.sub, seq)) {
        const at = store.member(conv.id, ctx.auth.sub).last_read_seq;
        // With read receipts off, only the reader's own devices hear about it.
        const audience = store.privacy(ctx.auth.sub).readReceipts ? store.memberIds(conv.id) : [ctx.auth.sub];
        hub.emit(audience, { type: 'read', conversationId: conv.id, userId: ctx.auth.sub, seq: at });
      }
      return { ok: true };
    }],

    ['POST', '/v1/conversations/:id/files', async (ctx) => {
      const { conv } = access(ctx, ctx.params.id);
      return upload(ctx, conv.id);
    }],

    ['GET', '/v1/files/:id', async (ctx) => {
      const file = UUID.test(ctx.params.id) ? store.getFile(ctx.params.id) : null;
      if (!file) throw notFound('file not found');
      const { auth } = ctx;
      let allowed = auth.admin || file.ownerId === auth.sub;
      if (file.conversationId) {
        const isMember = !!store.member(file.conversationId, auth.sub);
        const msg = file.messageId && store.get('SELECT view_once FROM messages WHERE id = ?', file.messageId);
        // A view-once file can be fetched only by a recipient who has just opened it — not even by its sender.
        if (msg?.view_once) allowed = auth.admin || (isMember && store.openedWithin(file.messageId, auth.sub, VIEW_ONCE_GRACE_MS));
        else if (file.messageId) allowed ||= isMember;
      } else if (file.messageId) {
        allowed ||= store.peers(auth.sub).includes(file.ownerId); // a story
      }
      if (!allowed) throw notFound('file not found');
      // Never serve uploads as a renderable type: the client turns them into blobs itself.
      ctx.res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': file.size,
        'content-disposition': 'attachment',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'cache-control': 'private, max-age=3600',
      });
      (await storage.stream(file.id)).on('error', () => ctx.res.destroy()).pipe(ctx.res);
      return undefined;
    }],

    ['PATCH', '/v1/messages/:id', async (ctx) => {
      const { message, conv } = messageAccess(ctx, ctx.params.id);
      if (message.senderId !== ctx.auth.sub) throw forbidden('you can only edit your own messages');
      if (message.deleted || message.kind !== 'text' || message.viewOnce) throw bad('this message cannot be edited');
      const body = str((await ctx.json()).body, 'body', MAX_BODY_CHARS);
      // An edit stays on the key the message was written with (its attachment depends on it).
      const epoch = (s) => /^e1\.(\d{1,9})\./.exec(s)?.[1];
      if (conv.encrypted && (!epoch(body) || epoch(body) !== epoch(message.body))) throw bad('an edit must be encrypted with the original message key');
      const updated = store.editMessage(message.id, body);
      hub.emit(store.memberIds(conv.id), { type: 'message.updated', message: updated });
      return updated;
    }],

    ['DELETE', '/v1/messages/:id', async (ctx) => {
      const { message, conv, member } = messageAccess(ctx, ctx.params.id);
      const moderator = ctx.auth.admin || (conv.type === 'group' && member.role !== 'member');
      if (message.senderId !== ctx.auth.sub && !moderator) throw forbidden('you can only delete your own messages');
      const fileId = store.deleteMessage(message.id);
      if (fileId) await removeFile(fileId);
      hub.emit(store.memberIds(conv.id), { type: 'message.deleted', conversationId: conv.id, messageId: message.id });
      return { deleted: true };
    }],

    ['PUT', '/v1/messages/:id/pin', (ctx) => pin(ctx, true)],
    ['DELETE', '/v1/messages/:id/pin', (ctx) => pin(ctx, false)],

    ['PUT', '/v1/messages/:id/vote', async (ctx) => {
      const { message, conv, member } = messageAccess(ctx, ctx.params.id);
      if (!member) throw forbidden();
      if (message.kind !== 'poll' || message.deleted) throw bad('not a poll');
      const { options } = await ctx.json();
      if (!Array.isArray(options) || options.some((o) => !Number.isInteger(o) || o < 0 || o >= message.poll.options)) throw bad('options must be valid choice indexes');
      const picks = [...new Set(options)];
      if (!message.poll.multi && picks.length > 1) throw bad('this poll allows one choice');
      const updated = store.vote(message.id, ctx.auth.sub, picks);
      hub.emit(store.memberIds(conv.id), { type: 'message.updated', message: updated });
      return updated;
    }],

    // View-once: the content is handed to each recipient a single time, then wiped.
    ['POST', '/v1/messages/:id/open', (ctx) => {
      const { message, conv, member } = messageAccess(ctx, ctx.params.id);
      if (!member || !message.viewOnce) throw bad('not a view-once message');
      if (message.senderId === ctx.auth.sub) throw forbidden('you cannot reopen your own view-once message');
      const full = message.consumed ? null : store.openMessage(message.id, ctx.auth.sub);
      if (!full) throw new HttpError(410, 'gone', 'this message was already opened');
      hub.emit(store.memberIds(conv.id), { type: 'message.updated', message: store.getMessage(message.id) });
      return full;
    }],

    ['POST', '/v1/messages/:id/report', async (ctx) => {
      const { message, conv, member } = messageAccess(ctx, ctx.params.id);
      if (!member) throw forbidden();
      const reason = str((await ctx.json()).reason ?? 'unspecified', 'reason', 500);
      const id = store.addReport({ messageId: message.id, conversationId: conv.id, reporterId: ctx.auth.sub, reason, snapshot: message });
      webhook({ type: 'message.reported', reportId: id, reporterId: ctx.auth.sub, reason, message, conversation: { id: conv.id, type: conv.type, encrypted: !!conv.encrypted } });
      ctx.status = 201;
      return { reportId: id };
    }],

    // Calls through the host's own vendor (Twilio, Agora, Daily, LiveKit, Jitsi,
    // Zoom...). PlugChat keeps the call's place in the conversation and who may
    // join; the host's `call.join` hook turns that into a vendor room or token.
    ['POST', '/v1/conversations/:id/calls', async (ctx) => {
      const { conv, member } = access(ctx, ctx.params.id);
      if (callMode !== 'external') throw notFound('no call provider is configured; use peer-to-peer calls');
      if (!member) throw forbidden();
      const memberIds = store.memberIds(conv.id);
      if (conv.type === 'dm' && store.isBlocked(ctx.auth.sub, memberIds.find((id) => id !== ctx.auth.sub))) throw forbidden('you cannot call this user');
      const video = (await ctx.json()).video === true;
      const call = store.addCall({ conversationId: conv.id, startedBy: ctx.auth.sub, video });
      const join = await joinCall(call, ctx.auth.sub, memberIds);
      const message = store.insertMessage({ conversationId: conv.id, senderId: ctx.auth.sub, kind: 'call', body: JSON.stringify({ callId: call.id, video }) });
      hub.emit(memberIds, { type: 'message.new', message });
      webhook({
        type: 'call.started', call, message,
        conversation: { id: conv.id, type: conv.type, title: conv.title },
        recipients: memberIds.filter((id) => id !== ctx.auth.sub).map((id) => ({ userId: id, online: hub.isOnline(id) })),
      });
      ctx.status = 201;
      return { call, message, join };
    }],

    ['POST', '/v1/calls/:id/join', async (ctx) => {
      const call = UUID.test(ctx.params.id) ? store.getCall(ctx.params.id) : null;
      if (!call || !store.member(call.conversationId, ctx.auth.sub)) throw notFound('call not found');
      return { call, join: await joinCall(call, ctx.auth.sub, store.memberIds(call.conversationId)) };
    }],

    // Suspended people can still read, but cannot send, upload, react or call.
    ['PUT', '/v1/users/:id/suspension', async (ctx) => {
      adminOnly(ctx);
      const b = await ctx.json();
      const reason = b.suspended === false ? null : str(b.reason ?? 'Your account is suspended', 'reason', 300);
      if (!store.setSuspension(ctx.params.id, reason)) throw notFound('user not found');
      return { userId: ctx.params.id, suspended: reason };
    }],

    ['GET', '/v1/users/:id/unread', (ctx) => {
      adminOnly(ctx);
      if (!store.getUser(ctx.params.id)) throw notFound('user not found');
      return store.unreadSummary(ctx.params.id);
    }],

    ['GET', '/v1/stats', (ctx) => (adminOnly(ctx), store.stats())],
    ['GET', '/v1/reports', (ctx) => {
      adminOnly(ctx);
      const name = (id) => store.getUser(id)?.name ?? id;
      return {
        reports: store.listReports().map((r) => ({
          ...r, reporterName: name(r.reporterId), senderName: name(r.message.senderId), senderSuspended: !!store.suspension(r.message.senderId),
        })),
      };
    }],

    ['DELETE', '/v1/reports/:id', (ctx) => {
      adminOnly(ctx);
      if (!store.deleteReport(ctx.params.id)) throw notFound('report not found');
      return { dismissed: true };
    }],

    ['POST', '/v1/files', async (ctx) => {
      if (!stories) throw notFound('stories are disabled');
      return upload(ctx, null);
    }],

    ['GET', '/v1/stories', (ctx) => {
      if (!stories) throw notFound('stories are disabled');
      return { feed: store.storyFeed(ctx.auth.sub) };
    }],

    ['POST', '/v1/stories', async (ctx) => {
      if (!stories) throw notFound('stories are disabled');
      const b = await ctx.json();
      let attachment = null;
      if (b.attachment) {
        const file = store.getFile(str(b.attachment.fileId, 'attachment.fileId', 36));
        if (!file || file.conversationId || file.messageId || file.ownerId !== ctx.auth.sub) throw bad('unknown attachment');
        attachment = { fileId: file.id, name: file.name, mime: file.mime, size: file.size };
      }
      const text = str(b.text ?? '', 'text', 2000, { allowEmpty: !!attachment });
      const ttlSeconds = b.ttlSeconds ?? 86_400;
      if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 604_800) throw bad('ttlSeconds must be 60..604800');
      const story = store.addStory({ userId: ctx.auth.sub, text, attachment, ttlSeconds });
      hub.emit(store.peers(ctx.auth.sub), { type: 'story.new', userId: ctx.auth.sub, storyId: story.id });
      ctx.status = 201;
      return story;
    }],

    ['POST', '/v1/stories/:id/view', (ctx) => {
      const story = stories && store.getStory(ctx.params.id, ctx.auth.sub);
      if (!story || (story.userId !== ctx.auth.sub && !store.peers(ctx.auth.sub).includes(story.userId))) throw notFound('story not found');
      if (story.userId !== ctx.auth.sub && store.viewStory(story.id, ctx.auth.sub)) {
        hub.emit([story.userId], { type: 'story.viewed', storyId: story.id, userId: ctx.auth.sub });
      }
      return { ok: true };
    }],

    ['DELETE', '/v1/stories/:id', async (ctx) => {
      const story = store.getStory(ctx.params.id, ctx.auth.sub);
      if (!story || (story.userId !== ctx.auth.sub && !ctx.auth.admin)) throw notFound('story not found');
      const fileId = store.deleteStory(story.id);
      if (fileId) await removeFile(fileId);
      hub.emit([story.userId, ...store.peers(story.userId)], { type: 'story.deleted', userId: story.userId, storyId: story.id });
      return { deleted: true };
    }],

    ['PUT', '/v1/messages/:id/reactions/:emoji', (ctx) => react(ctx, true)],
    ['DELETE', '/v1/messages/:id/reactions/:emoji', (ctx) => react(ctx, false)],
  ].map(([method, pattern, handler]) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    return { method, re, keys, handler };
  });

  async function upload(ctx, conversationId) {
    const data = await ctx.raw(maxFileBytes);
    if (!data.length) throw bad('empty upload');
    let name = 'file';
    try {
      name = decodeURIComponent(String(ctx.req.headers['x-filename'] ?? 'file'));
    } catch {
      throw bad('x-filename must be URI-encoded');
    }
    name = name.replace(/[\\/\0-\x1f]/g, '_').slice(0, 200) || 'file';
    const mime = String(ctx.req.headers['content-type'] ?? 'application/octet-stream').split(';')[0].trim().slice(0, 100);
    const id = randomUUID();
    if (userStorageBytes > 0 && !ctx.auth.admin && store.storageUsed(ctx.auth.sub) + data.length > userStorageBytes) {
      throw new HttpError(413, 'quota_exceeded', 'you have used all of your file storage; delete some older files first');
    }
    if (!ctx.auth.admin) await gate('upload.before', { userId: ctx.auth.sub, conversationId, name, mime, size: data.length });
    await storage.put(id, data);
    store.addFile({ id, conversationId, ownerId: ctx.auth.sub, name, mime, size: data.length });
    ctx.status = 201;
    return { fileId: id, name, mime, size: data.length };
  }

  function pin(ctx, on) {
    const { message, conv, member } = messageAccess(ctx, ctx.params.id);
    if (message.deleted) throw bad('message was deleted');
    if (!ctx.auth.admin && conv.announce && member.role === 'member') throw forbidden('only admins can pin in this channel');
    const updated = store.pinMessage(message.id, on ? ctx.auth.sub : null);
    hub.emit(store.memberIds(conv.id), { type: 'message.updated', message: updated });
    return updated;
  }

  function star(ctx, on) {
    const { message, member } = messageAccess(ctx, ctx.params.id);
    if (!member) throw forbidden();
    store.setStar(ctx.auth.sub, message.id, on);
    // Private to the person: only their own devices are told.
    hub.emit([ctx.auth.sub], { type: 'star', conversationId: message.conversationId, messageId: message.id, starred: on });
    return { starred: on };
  }
  function react(ctx, on) {
    const { message, conv, member } = messageAccess(ctx, ctx.params.id);
    if (!member) throw forbidden();
    if (message.deleted) throw bad('message was deleted');
    const emoji = str(ctx.params.emoji, 'emoji', 16);
    const mine = Object.values(message.reactions).filter((users) => users.includes(ctx.auth.sub)).length;
    if (on && mine >= 8 && !message.reactions[emoji]?.includes(ctx.auth.sub)) throw bad('too many reactions on this message');
    const reactions = store.setReaction(message.id, ctx.auth.sub, emoji, on);
    hub.emit(store.memberIds(conv.id), { type: 'reaction', conversationId: conv.id, messageId: message.id, reactions });
    return { reactions };
  }

  function send(res, status, body, extra = {}) {
    if (res.headersSent) return;
    const data = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
    res.end(data);
  }

  async function raw(req, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new HttpError(413, 'too_large', `body exceeds ${limit} bytes`);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Node request handler. Resolves to false when the URL is not under
   * `basePath`, so it can sit in front of the host's own routes.
   */
  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== base && !url.pathname.startsWith(base + '/')) return false;
    const path = url.pathname.slice(base.length) || '/';

    const origin = req.headers.origin;
    if (origin && allowOrigin(origin)) {
      res.setHeader('access-control-allow-origin', origins === '*' ? '*' : origin);
      res.setHeader('vary', 'origin');
      res.setHeader('access-control-allow-headers', 'authorization, content-type, x-filename');
      res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('access-control-max-age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return true;
    }

    try {
      if (path === '/health') return send(res, 200, { ok: true }), true;

      if (req.method === 'GET' && path === '/admin') {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          // Never framed, and it can talk to nothing but this server.
          'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        });
        res.end(ADMIN_PAGE);
        return true;
      }

      if (req.method === 'GET' && path === '/embed') {
        // Only the host's own sites may frame the chat, and the page may only talk to this server.
        const ancestors = origins === '*' ? '*' : ["'self'", ...origins].join(' ');
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-cache',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          'content-security-policy': `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self' ws: wss:; img-src blob: data: https:; media-src blob:; frame-src https:; base-uri 'none'; form-action 'none'; frame-ancestors ${ancestors}`,
        });
        res.end(EMBED_PAGE);
        return true;
      }

      if (req.method === 'GET' && path.startsWith('/client/')) {
        const name = path.slice('/client/'.length);
        if (!CLIENT_FILES.has(name)) throw notFound();
        const js = await readFile(join(CLIENT_DIR, name));
        // Always revalidate, so an upgraded server never runs against a stale client.
        const etag = `"${createHash('sha256').update(js).digest('base64url').slice(0, 22)}"`;
        const headers = {
          'content-type': 'text/javascript; charset=utf-8',
          'access-control-allow-origin': '*',
          'cross-origin-resource-policy': 'cross-origin',
          'x-content-type-options': 'nosniff',
          'cache-control': 'no-cache',
          etag,
        };
        if (req.headers['if-none-match'] === etag) res.writeHead(304, headers).end();
        else res.writeHead(200, headers).end(js);
        return true;
      }

      let route, match, params;
      for (const r of routes) {
        if (r.method === req.method && (match = r.re.exec(path))) {
          route = r;
          break;
        }
      }
      if (!route) throw notFound('no such endpoint');
      try {
        params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
      } catch {
        throw bad('malformed path');
      }

      const header = req.headers.authorization ?? '';
      let auth;
      try {
        auth = authenticate(header.startsWith('Bearer ') ? header.slice(7) : '');
      } catch (e) {
        throw new HttpError(401, 'unauthorized', e.message);
      }
      if (req.method !== 'GET' && !auth.admin && !allowWrite(auth.sub)) {
        throw new HttpError(429, 'rate_limited', 'slow down');
      }
      if (req.method !== 'GET' && !auth.admin) {
        const reason = store.suspension(auth.sub);
        if (reason) throw new HttpError(403, 'suspended', reason);
      }

      const ctx = {
        req, res, url, auth, params, status: 200,
        raw: (limit) => raw(req, limit),
        json: async () => {
          const buf = await raw(req, MAX_JSON);
          try {
            const v = JSON.parse(buf.toString() || '{}');
            if (!v || typeof v !== 'object' || Array.isArray(v)) throw 0;
            return v;
          } catch {
            throw bad('body must be a JSON object');
          }
        },
      };
      const out = await route.handler(ctx);
      if (out !== undefined) send(res, ctx.status, out);
    } catch (e) {
      if (e instanceof HttpError) {
        send(res, e.status, { error: e.code, message: e.message }, e.status === 413 ? { connection: 'close' } : {});
      } else {
        log.error('plugchat internal error', e);
        send(res, 500, { error: 'internal', message: 'internal error' });
      }
    }
    return true;
  }

  /** Wire the realtime endpoint onto an existing http.Server. */
  function attach(server) {
    server.on('upgrade', (req, socket, head) => {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname === `${base}/v1/ws`) hub.upgrade(req, socket, head);
    });
    return server;
  }

  /** Run as a standalone sidecar service. */
  function listen(port, host) {
    const server = createServer(async (req, res) => {
      if (!(await handle(req, res))) res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not_found"}');
    });
    attach(server);
    return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
  }

  function close() {
    clearInterval(sweeper);
    hub.close();
    bus?.close?.();
    store.close();
  }

  /**
   * Call the REST API from inside the host's own Node process: admin rights,
   * no network hop, same validation and realtime events as an HTTP call.
   * JSON endpoints only.
   */
  async function api(method, path, body) {
    const token = signToken({ sub: 'host', admin: true }, secret, 60);
    const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), {
      method, url: base + path, headers: { authorization: `Bearer ${token}` },
    });
    let status = 200;
    let text = '';
    const res = {
      headersSent: false,
      setHeader() {},
      writeHead(code) {
        status = code;
        this.headersSent = true;
        return this;
      },
      end(data) {
        if (data) text += data;
      },
    };
    await handle(req, res);
    const out = text ? JSON.parse(text) : undefined;
    if (status >= 400) throw Object.assign(new Error(out?.message ?? `request failed (${status})`), { status, code: out?.error });
    return out;
  }

  const u = encodeURIComponent;
  /** The things a host backend most often does, as plain function calls. */
  const admin = {
    upsertUser: (id, profile = {}) => api('PUT', `/v1/users/${u(id)}`, profile),
    deleteUser: (id) => api('DELETE', `/v1/users/${u(id)}`),
    exportUser: (id) => api('GET', `/v1/users/${u(id)}/export`),
    suspend: (id, reason) => api('PUT', `/v1/users/${u(id)}/suspension`, { suspended: true, reason }),
    unsuspend: (id) => api('PUT', `/v1/users/${u(id)}/suspension`, { suspended: false }),
    unread: (id) => api('GET', `/v1/users/${u(id)}/unread`),
    openDm: (a, b) => api('POST', '/v1/conversations', { type: 'dm', memberIds: [a, b] }),
    createGroup: (group) => api('POST', '/v1/conversations', { type: 'group', ...group }),
    addMembers: (conversationId, userIds) => api('POST', `/v1/conversations/${conversationId}/members`, { userIds }),
    removeMember: (conversationId, userId) => api('DELETE', `/v1/conversations/${conversationId}/members/${u(userId)}`),
    /** Post a notice (a string) or any message object, e.g. { kind: 'text', senderId, body }. */
    post: (conversationId, message) => api('POST', `/v1/conversations/${conversationId}/messages`, typeof message === 'string' ? { body: message } : message),
    deleteMessage: (id) => api('DELETE', `/v1/messages/${id}`),
    reports: () => api('GET', '/v1/reports').then((r) => r.reports),
    stats: () => api('GET', '/v1/stats'),
  };

  return {
    handle,
    attach,
    listen,
    close,
    store,
    api,
    admin,
    basePath: base,
    /** Mint a user token: `signToken({ sub, name, avatar })`. Admin token: `{ sub, admin: true }`. */
    signToken: (claims, ttlSeconds) => signToken(claims, secret, ttlSeconds),
  };
}
