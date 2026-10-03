import { createServer } from 'node:http';
import { createReadStream, mkdirSync } from 'node:fs';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { Hub } from './hub.js';
import { signToken, verifyToken, signWebhook } from './auth.js';

export { signToken, verifyToken, signWebhook };

const CLIENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'client');
const CLIENT_FILES = new Set(['plugchat.js', 'e2ee.js', 'element.js']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_JSON = 256 * 1024;
const MAX_BODY_CHARS = 32_000;
const MAX_MEMBERS = 1000;

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
    log = console,
  } = options;

  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('PlugChat: `secret` must be a string of at least 32 characters');
  }
  const base = basePath.replace(/\/+$/, '');
  const filesDir = join(dataDir, 'files');
  mkdirSync(filesDir, { recursive: true });

  const store = new Store(join(dataDir, 'plugchat.db'));
  const seen = new Map(); // sub -> "name\navatar" already written to the store
  const allowWrite = limiter(5, 30);

  function authenticate(token) {
    const claims = verifyToken(token, secret);
    if (claims.admin === true) return claims;
    const name = typeof claims.name === 'string' ? claims.name.slice(0, 120) : undefined;
    const avatar = typeof claims.avatar === 'string' && /^https?:\/\//.test(claims.avatar) ? claims.avatar.slice(0, 500) : undefined;
    const sig = `${name}\n${avatar}`;
    if (seen.get(claims.sub) !== sig) {
      store.upsertUser(claims.sub, name, avatar);
      seen.set(claims.sub, sig);
    }
    return claims;
  }

  const allowOrigin = (origin) => !origin || origins === '*' || origins.includes(origin);
  const hub = new Hub({ store, authenticate, allowOrigin });

  const sweeper = setInterval(() => {
    try {
      const gone = store.sweepExpired();
      for (const m of gone) {
        hub.emit(store.memberIds(m.conversationId), { type: 'message.deleted', conversationId: m.conversationId, messageId: m.id, expired: true });
        if (m.fileId) unlink(join(filesDir, m.fileId)).catch(() => {});
      }
      allowWrite.prune();
    } catch (e) {
      log.error('plugchat sweep failed', e);
    }
  }, 5000);
  sweeper.unref();

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

  function requireKeys(ids, keys) {
    const out = {};
    for (const id of ids) {
      if (!store.getUser(id).publicKey) throw new HttpError(409, 'no_public_key', `user "${id}" has not set up encryption yet`);
      if (!keys?.[id]) throw bad(`missing wrapped key for "${id}"`);
      out[id] = wrappedKey(keys[id]);
    }
    return out;
  }

  const adminOnly = (ctx) => {
    if (!ctx.auth.admin) throw forbidden('admin token required');
  };

  const routes = [
    ['GET', '/v1/me', (ctx) => ({ ...store.getUser(ctx.auth.sub), directory })],

    ['PUT', '/v1/me/key', async (ctx) => {
      const { publicKey } = await ctx.json();
      store.setPublicKey(ctx.auth.sub, str(publicKey, 'publicKey', 256));
      return store.getUser(ctx.auth.sub);
    }],

    ['GET', '/v1/users', (ctx) => {
      if (!directory && !ctx.auth.admin) throw forbidden('user directory is disabled');
      const users = store.searchUsers(ctx.url.searchParams.get('q') ?? '', ctx.auth.sub);
      return { users: users.map((u) => ({ ...u, online: hub.isOnline(u.id) })) };
    }],

    ['GET', '/v1/users/:id', (ctx) => {
      const user = store.getUser(ctx.params.id);
      if (!user) throw notFound('user not found');
      return { ...user, online: hub.isOnline(user.id) };
    }],

    ['PUT', '/v1/users/:id', async (ctx) => {
      adminOnly(ctx);
      const b = await ctx.json();
      seen.delete(ctx.params.id);
      return store.upsertUser(str(ctx.params.id, 'id', 128), str(b.name, 'name', 120, { optional: true }), str(b.avatar, 'avatar', 500, { optional: true }));
    }],

    ['DELETE', '/v1/users/:id', async (ctx) => {
      adminOnly(ctx);
      const peers = store.peers(ctx.params.id);
      const groups = store.all("SELECT conversation_id AS id FROM members m JOIN conversations c ON c.id = m.conversation_id WHERE m.user_id = ? AND c.type = 'group'", ctx.params.id);
      const files = store.deleteUser(ctx.params.id);
      seen.delete(ctx.params.id);
      hub.disconnect(ctx.params.id);
      await Promise.all(files.map((f) => unlink(join(filesDir, f)).catch(() => {})));
      for (const g of groups) pushConversation(g.id);
      hub.emit(peers, { type: 'user.deleted', userId: ctx.params.id });
      return { deleted: true };
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
      const id = b.id === undefined ? undefined : str(b.id, 'id', 36);
      if (id !== undefined && (!UUID.test(id) || store.conversationExists(id))) throw bad('id must be an unused UUID');
      const cid = store.createConversation({
        id,
        type: b.type,
        title: b.type === 'group' ? str(b.title, 'title', 120) : null,
        creator,
        memberIds,
        encrypted,
        ttlSeconds: b.ttlSeconds === undefined ? null : ttl(b.ttlSeconds),
        keys: encrypted ? requireKeys(memberIds, b.keys) : null,
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
      store.updateConversation(conv.id, patch);
      pushConversation(conv.id);
      return store.conversationFor(conv.id, ctx.auth.sub);
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
      store.addMembers(conv.id, userIds, conv.encrypted ? requireKeys(userIds, b.keys) : null);
      pushConversation(conv.id);
      return store.conversationFor(conv.id, ctx.auth.sub);
    }],

    ['PATCH', '/v1/conversations/:id/members/:uid', async (ctx) => {
      const { conv, member } = access(ctx, ctx.params.id);
      if (!ctx.auth.admin && member.role !== 'owner') throw forbidden('only the owner can change roles');
      const { role } = await ctx.json();
      if (role !== 'admin' && role !== 'member') throw bad('role must be "admin" or "member"');
      const target = store.member(conv.id, ctx.params.uid);
      if (!target || target.role === 'owner') throw bad('cannot change that member');
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
        await Promise.all(files.map((f) => unlink(join(filesDir, f.id)).catch(() => {})));
      } else {
        if (!left.some((m) => m.role === 'owner')) store.setRole(conv.id, left[0].user_id, 'owner');
        pushConversation(conv.id);
      }
      return { removed: true };
    }],

    ['GET', '/v1/conversations/:id/messages', (ctx) => {
      access(ctx, ctx.params.id);
      const q = ctx.url.searchParams;
      const before = q.has('before') ? Number(q.get('before')) : undefined;
      const limit = Math.min(Math.max(Number(q.get('limit')) || 50, 1), 200);
      if (before !== undefined && !Number.isInteger(before)) throw bad('before must be an integer seq');
      return { messages: store.listMessages(ctx.params.id, { before, limit }) };
    }],

    ['POST', '/v1/conversations/:id/messages', async (ctx) => {
      const { conv } = access(ctx, ctx.params.id);
      const b = await ctx.json();
      const { auth } = ctx;
      const kind = auth.admin ? (b.kind === 'text' ? 'text' : 'system') : 'text';
      const senderId = auth.admin && b.senderId ? str(b.senderId, 'senderId', 128) : auth.sub;

      const clientId = str(b.clientId, 'clientId', 64, { optional: true });
      if (clientId) {
        const dup = store.findByClientId(conv.id, senderId, clientId);
        if (dup) return dup;
      }

      let attachment = null;
      if (b.attachment) {
        const file = store.getFile(str(b.attachment.fileId, 'attachment.fileId', 36));
        if (!file || file.conversationId !== conv.id || (file.ownerId !== auth.sub && !auth.admin)) throw bad('unknown attachment');
        attachment = { fileId: file.id, name: file.name, mime: file.mime, size: file.size };
      }
      const body = str(b.body ?? '', 'body', MAX_BODY_CHARS, { allowEmpty: !!attachment });
      // Refuse plaintext in an encrypted conversation so a buggy client can't leak content.
      if (conv.encrypted && kind === 'text' && !body.startsWith('e1.')) throw bad('this conversation only accepts encrypted messages');

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

      const message = store.insertMessage({ conversationId: conv.id, senderId, kind, body, replyTo, attachment, clientId });
      hub.emit(memberIds, { type: 'message.new', message });
      webhook({
        type: 'message.new',
        message,
        conversation: { id: conv.id, type: conv.type, title: conv.title, encrypted: !!conv.encrypted },
        recipients: memberIds.filter((id) => id !== senderId).map((id) => ({ userId: id, online: hub.isOnline(id) })),
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
        hub.emit(store.memberIds(conv.id), { type: 'read', conversationId: conv.id, userId: ctx.auth.sub, seq: at });
      }
      return { ok: true };
    }],

    ['POST', '/v1/conversations/:id/files', async (ctx) => {
      const { conv } = access(ctx, ctx.params.id);
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
      await writeFile(join(filesDir, id), data, { flag: 'wx' });
      store.addFile({ id, conversationId: conv.id, ownerId: ctx.auth.sub, name, mime, size: data.length });
      ctx.status = 201;
      return { fileId: id, name, mime, size: data.length };
    }],

    ['GET', '/v1/files/:id', (ctx) => {
      const file = UUID.test(ctx.params.id) ? store.getFile(ctx.params.id) : null;
      if (!file) throw notFound('file not found');
      try {
        access(ctx, file.conversationId);
      } catch {
        throw notFound('file not found');
      }
      // Never serve uploads as a renderable type: the client turns them into blobs itself.
      ctx.res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': file.size,
        'content-disposition': 'attachment',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'cache-control': 'private, max-age=3600',
      });
      createReadStream(join(filesDir, file.id)).on('error', () => ctx.res.destroy()).pipe(ctx.res);
      return undefined;
    }],

    ['PATCH', '/v1/messages/:id', async (ctx) => {
      const { message, conv } = messageAccess(ctx, ctx.params.id);
      if (message.senderId !== ctx.auth.sub) throw forbidden('you can only edit your own messages');
      if (message.deleted || message.kind !== 'text') throw bad('this message cannot be edited');
      const body = str((await ctx.json()).body, 'body', MAX_BODY_CHARS);
      if (conv.encrypted && !body.startsWith('e1.')) throw bad('this conversation only accepts encrypted messages');
      const updated = store.editMessage(message.id, body);
      hub.emit(store.memberIds(conv.id), { type: 'message.updated', message: updated });
      return updated;
    }],

    ['DELETE', '/v1/messages/:id', async (ctx) => {
      const { message, conv, member } = messageAccess(ctx, ctx.params.id);
      const moderator = ctx.auth.admin || (conv.type === 'group' && member.role !== 'member');
      if (message.senderId !== ctx.auth.sub && !moderator) throw forbidden('you can only delete your own messages');
      const fileId = store.deleteMessage(message.id);
      if (fileId) await unlink(join(filesDir, fileId)).catch(() => {});
      hub.emit(store.memberIds(conv.id), { type: 'message.deleted', conversationId: conv.id, messageId: message.id });
      return { deleted: true };
    }],

    ['PUT', '/v1/messages/:id/reactions/:emoji', (ctx) => react(ctx, true)],
    ['DELETE', '/v1/messages/:id/reactions/:emoji', (ctx) => react(ctx, false)],
  ].map(([method, pattern, handler]) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    return { method, re, keys, handler };
  });

  function react(ctx, on) {
    const { message, conv, member } = messageAccess(ctx, ctx.params.id);
    if (!member) throw forbidden();
    if (message.deleted) throw bad('message was deleted');
    const emoji = str(ctx.params.emoji, 'emoji', 16);
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

      if (req.method === 'GET' && path.startsWith('/client/')) {
        const name = path.slice('/client/'.length);
        if (!CLIENT_FILES.has(name)) throw notFound();
        const js = await readFile(join(CLIENT_DIR, name));
        res.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'access-control-allow-origin': '*',
          'cross-origin-resource-policy': 'cross-origin',
          'x-content-type-options': 'nosniff',
          'cache-control': 'public, max-age=300',
        });
        res.end(js);
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
    store.close();
  }

  return {
    handle,
    attach,
    listen,
    close,
    store,
    basePath: base,
    /** Mint a user token: `signToken({ sub, name, avatar })`. Admin token: `{ sub, admin: true }`. */
    signToken: (claims, ttlSeconds) => signToken(claims, secret, ttlSeconds),
  };
}
