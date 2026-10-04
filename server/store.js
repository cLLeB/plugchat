import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { PostgresDatabase } from './postgres.js';

// All SQL lives in this file so another database can be supported by
// re-implementing this one class.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT,
  public_key TEXT,
  last_seen INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT,
  dm_key TEXT UNIQUE,
  encrypted INTEGER NOT NULL DEFAULT 0,
  ttl_seconds INTEGER,
  announce INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  last_read_seq INTEGER NOT NULL DEFAULT 0,
  wrapped_key TEXT,
  muted INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE TABLE IF NOT EXISTS handles (
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (kind, value)
);
CREATE INDEX IF NOT EXISTS handles_user ON handles(user_id);
CREATE INDEX IF NOT EXISTS members_user ON members(user_id);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  sender_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  reply_to TEXT,
  attachment TEXT,
  client_id TEXT,
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  deleted_at INTEGER,
  expires_at INTEGER,
  meta TEXT,
  view_once INTEGER NOT NULL DEFAULT 0,
  consumed_at INTEGER,
  pinned_at INTEGER,
  pinned_by TEXT,
  UNIQUE (conversation_id, seq)
);
CREATE INDEX IF NOT EXISTS messages_view_once ON messages(view_once) WHERE view_once = 1 AND consumed_at IS NULL;
CREATE TABLE IF NOT EXISTS votes (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  option INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id, option)
);
CREATE TABLE IF NOT EXISTS opens (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  attachment TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS story_views (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (story_id, user_id)
);
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  started_by TEXT NOT NULL,
  video INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id)
);
CREATE TABLE IF NOT EXISTS member_keys (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  wrapped TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id, device_id, epoch)
);
CREATE TABLE IF NOT EXISTS stars (
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, message_id)
);
CREATE TABLE IF NOT EXISTS bus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance TEXT NOT NULL,
  payload TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS presence (
  user_id TEXT NOT NULL,
  instance TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, instance)
);
CREATE TABLE IF NOT EXISTS scheduled (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  send_at INTEGER NOT NULL,
  error TEXT
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS key_backups (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  salt TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  next_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_expiry ON messages(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_client ON messages(conversation_id, sender_id, client_id);
CREATE TABLE IF NOT EXISTS reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  message_id TEXT,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blocks (
  user_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);
`;

/**
 * Platforms identify people differently (email, phone, username, member
 * number...). A handle is any such identifier, normalised so lookups match
 * however it was typed.
 */
export function normalizeHandle(kind, value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().slice(0, 254);
  if (kind === 'phone') return v.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  if (kind === 'username') return v.replace(/^@/, '').toLowerCase();
  return v.toLowerCase();
}

// Every normalised form a typed value could take, since we don't know its kind.
const handleCandidates = (value) =>
  [...new Set(['email', 'phone', 'username'].map((k) => normalizeHandle(k, value)).filter(Boolean))];

// A picture someone uploaded here wins over the one their platform supplied.
const avatarOf = (file, url) => (file ? `pc:${file}` : url ?? null);
const userOut = (r) => r && { id: r.id, name: r.name, avatar: avatarOf(r.avatar_file, r.avatar), about: r.about ?? null, publicKey: r.public_key, lastSeen: r.last_seen };

// Columns added after the first release. Applied to existing databases on start.
const ADDED_COLUMNS = [
  ['conversations', 'key_epoch', 'INTEGER NOT NULL DEFAULT 0'],
  ['conversations', 'rotate_pending', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'hide_read', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'hide_presence', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'suspended', 'TEXT'],
  ['users', 'avatar_file', 'TEXT'],
  ['users', 'about', 'TEXT'],
  ['conversations', 'avatar_file', 'TEXT'],
];

const MAX_DEVICES = 10;

export class Store {
  /**
   * @param {string} file                      Path of the SQLite database file.
   * @param {{ url: string, schema?: string }} [database]  Use PostgreSQL instead.
   */
  constructor(file, database) {
    this.postgres = !!database;
    if (database) {
      this.db = new PostgresDatabase(database);
      this.db.exec(SCHEMA);
      for (const [table, column, ddl] of ADDED_COLUMNS) this.db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${ddl}`);
    } else {
      this.db = new DatabaseSync(file);
      this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
      this.db.exec(SCHEMA);
      for (const [table, column, ddl] of ADDED_COLUMNS) {
        const has = this.db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
        if (!has) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
      }
    }
    this._stmts = new Map();
  }

  close() {
    this.db.close();
  }

  _p(sql) {
    let s = this._stmts.get(sql);
    if (!s) this._stmts.set(sql, (s = this.db.prepare(sql)));
    return s;
  }
  get(sql, ...a) { return this._p(sql).get(...a); }
  all(sql, ...a) { return this._p(sql).all(...a); }
  run(sql, ...a) { return this._p(sql).run(...a); }

  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // ---- users ----

  upsertUser(id, name, avatar) {
    this.run(
      `INSERT INTO users (id, name, avatar, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = COALESCE(?, name), avatar = COALESCE(?, avatar)`,
      id, name ?? id, avatar ?? null, Date.now(), name ?? null, avatar ?? null,
    );
    return this.getUser(id);
  }

  getUser(id) {
    return userOut(this.get('SELECT * FROM users WHERE id = ?', id));
  }

  /** Substring match on display name; handles (email, phone, ...) only ever match exactly. */
  searchUsers(q, excludeId, limit = 20) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const candidates = handleCandidates(q);
    const marks = candidates.map(() => '?').join(',') || "''";
    return this.db.prepare(
      `SELECT * FROM users WHERE id != ? AND (name LIKE ? ESCAPE '\\' OR id = ?
         OR id IN (SELECT user_id FROM handles WHERE value IN (${marks})))
       ORDER BY name LIMIT ?`,
    ).all(excludeId, like, q, ...candidates, limit).map(userOut);
  }

  // ---- handles: the identifiers a platform's users know each other by ----

  handlesOf(userId) {
    return Object.fromEntries(this.all('SELECT kind, value FROM handles WHERE user_id = ?', userId).map((r) => [r.kind, r.value]));
  }

  /** Replace a user's handles. Returns the kinds that were skipped because someone else holds that value. */
  setHandles(userId, handles) {
    const taken = [];
    this.tx(() => {
      this.run('DELETE FROM handles WHERE user_id = ?', userId);
      for (const [kind, raw] of Object.entries(handles)) {
        const value = normalizeHandle(kind, raw);
        if (!value) continue;
        const r = this.run('INSERT OR IGNORE INTO handles (kind, value, user_id) VALUES (?, ?, ?)', kind, value, userId);
        if (!r.changes) taken.push(kind);
      }
    });
    return taken;
  }

  findByHandle(value, kind) {
    const r = kind
      ? this.get('SELECT user_id FROM handles WHERE kind = ? AND value = ?', kind, normalizeHandle(kind, value))
      : this.db.prepare(`SELECT user_id FROM handles WHERE value IN (${handleCandidates(value).map(() => '?').join(',') || "''"}) LIMIT 1`).get(...handleCandidates(value));
    return r ? this.getUser(r.user_id) : null;
  }

  // ---- profile pictures and the "about" line ----

  /** Point a person or a group at a new picture file. Returns the file it replaces, to be deleted. */
  setAvatar(kind, id, fileId) {
    const table = kind === 'user' ? 'users' : 'conversations';
    const old = this.get(`SELECT avatar_file FROM ${table} WHERE id = ?`, id)?.avatar_file ?? null;
    this.run(`UPDATE ${table} SET avatar_file = ? WHERE id = ?`, fileId, id);
    if (old) this.run('DELETE FROM files WHERE id = ?', old);
    return old;
  }

  setAbout(userId, about) {
    this.run('UPDATE users SET about = ? WHERE id = ?', about, userId);
  }

  /** Register an uploaded picture. Marked so the sweep for abandoned uploads leaves it alone. */
  addAvatarFile({ id, ownerId, mime, size }) {
    this.run('INSERT INTO files (id, conversation_id, message_id, owner_id, name, mime, size, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)',
      id, 'avatar', ownerId, 'avatar', mime, size, Date.now());
  }

  // ---- devices: one encryption key per browser or phone a person uses ----

  /** Returns true when this is a device (or key) the server has not seen before. */
  registerDevice(userId, deviceId, publicKey) {
    const t = Date.now();
    const known = this.get('SELECT public_key FROM devices WHERE user_id = ? AND device_id = ?', userId, deviceId);
    if (known?.public_key === publicKey) {
      this.run('UPDATE devices SET last_seen = ? WHERE user_id = ? AND device_id = ?', t, userId, deviceId);
      return false;
    }
    this.tx(() => {
      // A changed key means the old wrapped keys are useless to this device.
      this.run('DELETE FROM member_keys WHERE user_id = ? AND device_id = ?', userId, deviceId);
      this.run(
        `INSERT INTO devices (user_id, device_id, public_key, created_at, last_seen) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, device_id) DO UPDATE SET public_key = excluded.public_key, last_seen = excluded.last_seen`,
        userId, deviceId, publicKey, t, t,
      );
      const stale = this.all('SELECT device_id FROM devices WHERE user_id = ? ORDER BY last_seen DESC LIMIT -1 OFFSET ?', userId, MAX_DEVICES);
      for (const d of stale) this.removeDevice(userId, d.device_id);
      this.run('UPDATE users SET public_key = ? WHERE id = ?', publicKey, userId);
    });
    return true;
  }

  removeDevice(userId, deviceId) {
    this.run('DELETE FROM member_keys WHERE user_id = ? AND device_id = ?', userId, deviceId);
    return this.run('DELETE FROM devices WHERE user_id = ? AND device_id = ?', userId, deviceId).changes > 0;
  }

  devicesOf(userId) {
    return this.all('SELECT device_id, public_key, created_at, last_seen FROM devices WHERE user_id = ? ORDER BY created_at', userId)
      .map((r) => ({ deviceId: r.device_id, publicKey: r.public_key, createdAt: r.created_at, lastSeen: r.last_seen }));
  }

  hasDevice(userId, deviceId) {
    return !!this.get('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?', userId, deviceId);
  }

  encryptedConversationIds(userId, limit = 200) {
    return this.all(
      'SELECT c.id FROM conversations c JOIN members m ON m.conversation_id = c.id WHERE m.user_id = ? AND c.encrypted = 1 LIMIT ?',
      userId, limit,
    ).map((r) => r.id);
  }

  /** Store wrapped conversation keys. Existing entries are never overwritten. */
  addMemberKeys(conversationId, keys) {
    for (const k of keys) {
      this.run('INSERT OR IGNORE INTO member_keys (conversation_id, user_id, device_id, epoch, wrapped) VALUES (?, ?, ?, ?, ?)',
        conversationId, k.userId, k.deviceId, k.epoch, JSON.stringify({ by: k.by, byKey: k.byKey, data: k.data }));
    }
  }

  /** A device discards a wrapped key it could not open, so another member can send a good one. */
  dropMemberKey(conversationId, userId, deviceId, epoch) {
    return this.run('DELETE FROM member_keys WHERE conversation_id = ? AND user_id = ? AND device_id = ? AND epoch = ?',
      conversationId, userId, deviceId, epoch).changes > 0;
  }

  /** Move a conversation to a fresh key. Fails (returns false) if someone else rotated first. */
  rotateKey(conversationId, epoch, keys) {
    return this.tx(() => {
      const c = this.get('SELECT key_epoch FROM conversations WHERE id = ?', conversationId);
      if (c.key_epoch + 1 !== epoch) return false;
      this.run('UPDATE conversations SET key_epoch = ?, rotate_pending = 0 WHERE id = ?', epoch, conversationId);
      this.addMemberKeys(conversationId, keys);
      return true;
    });
  }

  touchUser(id) {
    this.run('UPDATE users SET last_seen = ? WHERE id = ?', Date.now(), id);
  }

  /** Erase a user and everything they sent. Returns file ids to unlink. */
  deleteUser(id) {
    return this.tx(() => {
      const files = this.all('SELECT id FROM files WHERE owner_id = ?', id).map((r) => r.id);
      this.run('DELETE FROM files WHERE owner_id = ?', id);
      this.run('DELETE FROM reactions WHERE user_id = ?', id);
      this.run('DELETE FROM member_keys WHERE user_id = ?', id);
      this.run('DELETE FROM stars WHERE user_id = ?', id);
      this.run('DELETE FROM presence WHERE user_id = ?', id);
      this.run('DELETE FROM invites WHERE created_by = ?', id);
      // Groups they were in must move to a key they never held.
      this.run('UPDATE conversations SET rotate_pending = 1 WHERE encrypted = 1 AND id IN (SELECT conversation_id FROM members WHERE user_id = ?)', id);
      this.run('DELETE FROM votes WHERE user_id = ?', id);
      this.run('DELETE FROM opens WHERE user_id = ?', id);
      this.run('DELETE FROM story_views WHERE user_id = ?', id);
      this.run('DELETE FROM reports WHERE reporter_id = ?', id);
      this.run('DELETE FROM messages WHERE sender_id = ?', id);
      this.run('DELETE FROM blocks WHERE user_id = ? OR blocked_id = ?', id, id);
      this.run('DELETE FROM conversations WHERE type = ? AND id IN (SELECT conversation_id FROM members WHERE user_id = ?)', 'dm', id);
      this.run('DELETE FROM users WHERE id = ?', id);
      return files;
    });
  }

  /** Everyone who shares at least one conversation with this user. */
  peers(userId) {
    return this.all(
      `SELECT DISTINCT m2.user_id AS id FROM members m1
       JOIN members m2 ON m2.conversation_id = m1.conversation_id
       WHERE m1.user_id = ? AND m2.user_id != ?`,
      userId, userId,
    ).map((r) => r.id);
  }

  // ---- blocks ----

  block(userId, blockedId) {
    this.run('INSERT OR IGNORE INTO blocks (user_id, blocked_id) VALUES (?, ?)', userId, blockedId);
  }
  unblock(userId, blockedId) {
    this.run('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?', userId, blockedId);
  }
  blocks(userId) {
    return this.all('SELECT blocked_id FROM blocks WHERE user_id = ?', userId).map((r) => r.blocked_id);
  }
  isBlocked(userId, byId) {
    return !!this.get('SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?', byId, userId);
  }

  // ---- conversations ----

  static dmKey(a, b) {
    return [a, b].sort().join('\n');
  }

  findDm(a, b) {
    return this.get('SELECT id FROM conversations WHERE dm_key = ?', Store.dmKey(a, b))?.id ?? null;
  }

  conversationExists(id) {
    return !!this.get('SELECT 1 FROM conversations WHERE id = ?', id);
  }

  createConversation({ id, type, title, creator, memberIds, encrypted, ttlSeconds, keys, announce, description }) {
    const t = Date.now();
    const cid = id ?? randomUUID();
    this.tx(() => {
      this.run(
        `INSERT INTO conversations (id, type, title, dm_key, encrypted, ttl_seconds, announce, description, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        cid, type, title ?? null, type === 'dm' ? Store.dmKey(memberIds[0], memberIds[1]) : null,
        encrypted ? 1 : 0, ttlSeconds ?? null, announce ? 1 : 0, description ?? null, creator, t, t,
      );
      for (const uid of memberIds) {
        const role = type === 'group' && uid === creator ? 'owner' : 'member';
        this.run(
          'INSERT INTO members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
          cid, uid, role, t,
        );
      }
      if (encrypted) {
        this.run('UPDATE conversations SET key_epoch = 1 WHERE id = ?', cid);
        this.addMemberKeys(cid, keys);
      }
    });
    return cid;
  }

  member(conversationId, userId) {
    return this.get('SELECT * FROM members WHERE conversation_id = ? AND user_id = ?', conversationId, userId) ?? null;
  }

  memberIds(conversationId) {
    return this.all('SELECT user_id FROM members WHERE conversation_id = ?', conversationId).map((r) => r.user_id);
  }

  rawConversation(id) {
    return this.get('SELECT * FROM conversations WHERE id = ?', id) ?? null;
  }

  /** Conversation as seen by one user (includes their unread count and wrapped key). */
  conversationFor(id, userId) {
    const c = this.rawConversation(id);
    if (!c) return null;
    const rows = this.all(
      `SELECT m.user_id, m.role, m.last_read_seq, m.muted, m.archived, m.pinned, u.name, u.avatar, u.avatar_file, u.hide_read
       FROM members m JOIN users u ON u.id = m.user_id WHERE m.conversation_id = ? ORDER BY m.joined_at, u.name`,
      id,
    );
    const me = rows.find((r) => r.user_id === userId);
    const last = this.get(
      `SELECT * FROM messages WHERE conversation_id = ? AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY seq DESC LIMIT 1`,
      id, Date.now(),
    );
    return {
      id: c.id,
      type: c.type,
      title: c.title,
      avatar: avatarOf(c.avatar_file, null),
      encrypted: !!c.encrypted,
      ttlSeconds: c.ttl_seconds,
      announce: !!c.announce,
      description: c.description,
      muted: !!me?.muted,
      archived: !!me?.archived,
      pinned: !!me?.pinned,
      createdBy: c.created_by,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      lastSeq: c.last_seq,
      unread: me ? Math.max(0, c.last_seq - me.last_read_seq) : 0,
      ...(c.encrypted && this._keyView(c, userId)),
      members: rows.map((r) => ({
        userId: r.user_id, name: r.name, avatar: avatarOf(r.avatar_file, r.avatar), role: r.role,
        // People who turned read receipts off look permanently unread to everyone else.
        lastReadSeq: r.hide_read && r.user_id !== userId ? 0 : r.last_read_seq,
        ...(c.encrypted && { devices: this._memberDevices(c, r.user_id) }),
      })),
      lastMessage: last ? this._messageOut(last, this._reactions([last.id])) : null,
    };
  }

  /** The encryption state one user needs: every wrapped key held for any of their devices. */
  _keyView(c, userId) {
    const wrappedKeys = {};
    for (const k of this.all('SELECT device_id, epoch, wrapped FROM member_keys WHERE conversation_id = ? AND user_id = ?', c.id, userId)) {
      (wrappedKeys[k.device_id] ??= {})[k.epoch] = JSON.parse(k.wrapped);
    }
    return { keyEpoch: c.key_epoch, rotatePending: !!c.rotate_pending, wrappedKeys };
  }

  /** A member's devices, and whether each can already read at the current key. */
  _memberDevices(c, userId) {
    return this.all(
      `SELECT d.device_id, d.public_key, EXISTS (
         SELECT 1 FROM member_keys k WHERE k.conversation_id = ? AND k.user_id = d.user_id AND k.device_id = d.device_id AND k.epoch = ?
       ) AS keyed FROM devices d WHERE d.user_id = ? ORDER BY d.created_at`,
      c.id, c.key_epoch, userId,
    ).map((d) => ({ deviceId: d.device_id, publicKey: d.public_key, keyed: !!d.keyed }));
  }

  listConversations(userId, limit = 200) {
    return this.all(
      `SELECT c.id FROM conversations c JOIN members m ON m.conversation_id = c.id
       WHERE m.user_id = ? ORDER BY c.updated_at DESC LIMIT ?`,
      userId, limit,
    ).map((r) => this.conversationFor(r.id, userId));
  }

  updateConversation(id, { title, ttlSeconds, announce, description }) {
    if (title !== undefined) this.run('UPDATE conversations SET title = ? WHERE id = ?', title, id);
    if (ttlSeconds !== undefined) this.run('UPDATE conversations SET ttl_seconds = ? WHERE id = ?', ttlSeconds, id);
    if (announce !== undefined) this.run('UPDATE conversations SET announce = ? WHERE id = ?', announce ? 1 : 0, id);
    if (description !== undefined) this.run('UPDATE conversations SET description = ? WHERE id = ?', description, id);
  }

  /** Per-member preferences: these never affect what other members see. */
  setMemberSettings(conversationId, userId, { muted, archived, pinned }) {
    for (const [col, v] of [['muted', muted], ['archived', archived], ['pinned', pinned]]) {
      if (v !== undefined) this.run(`UPDATE members SET ${col} = ? WHERE conversation_id = ? AND user_id = ?`, v ? 1 : 0, conversationId, userId);
    }
  }

  mutedIds(conversationId) {
    return this.all('SELECT user_id FROM members WHERE conversation_id = ? AND muted = 1', conversationId).map((r) => r.user_id);
  }

  addMembers(conversationId, userIds, keys) {
    const t = Date.now();
    this.tx(() => {
      for (const uid of userIds) {
        this.run(
          'INSERT OR IGNORE INTO members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
          conversationId, uid, 'member', t,
        );
      }
      if (keys) this.addMemberKeys(conversationId, keys);
    });
  }

  removeMember(conversationId, userId) {
    this.tx(() => {
      this.run('DELETE FROM members WHERE conversation_id = ? AND user_id = ?', conversationId, userId);
      this.run('DELETE FROM member_keys WHERE conversation_id = ? AND user_id = ?', conversationId, userId);
      // Whoever left still knows the current key, so the next sender must replace it.
      this.run('UPDATE conversations SET rotate_pending = 1 WHERE id = ? AND encrypted = 1', conversationId);
    });
  }

  setRole(conversationId, userId, role) {
    this.run('UPDATE members SET role = ? WHERE conversation_id = ? AND user_id = ?', role, conversationId, userId);
  }

  // ---- messages ----

  _reactions(messageIds) {
    const out = new Map();
    if (!messageIds.length) return out;
    const rows = this.db
      .prepare(`SELECT * FROM reactions WHERE message_id IN (${messageIds.map(() => '?').join(',')})`)
      .all(...messageIds);
    for (const r of rows) {
      const byEmoji = out.get(r.message_id) ?? {};
      (byEmoji[r.emoji] ??= []).push(r.user_id);
      out.set(r.message_id, byEmoji);
    }
    return out;
  }

  _messageOut(r, reactions, { reveal = false } = {}) {
    const meta = r.meta ? JSON.parse(r.meta) : {};
    const attachment = r.attachment ? JSON.parse(r.attachment) : null;
    const out = {
      id: r.id,
      conversationId: r.conversation_id,
      seq: r.seq,
      senderId: r.sender_id,
      kind: r.kind,
      body: r.body,
      replyTo: r.reply_to,
      attachment,
      clientId: r.client_id,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      deleted: !!r.deleted_at,
      expiresAt: r.expires_at,
      reactions: reactions?.get(r.id) ?? {},
      mentions: meta.mentions ?? [],
      forwarded: !!meta.forwarded,
      pinned: r.pinned_at ? { at: r.pinned_at, by: r.pinned_by } : null,
    };
    if (r.kind === 'poll') {
      out.poll = meta.poll;
      out.votes = {};
      for (const v of this.all('SELECT user_id, option FROM votes WHERE message_id = ?', r.id)) (out.votes[v.option] ??= []).push(v.user_id);
    }
    if (r.view_once) {
      out.viewOnce = true;
      out.consumed = !!r.consumed_at;
      out.hasFile = !!attachment;
      out.openedBy = this.all('SELECT user_id FROM opens WHERE message_id = ?', r.id).map((o) => o.user_id);
      // The content of a view-once message is only ever released by openMessage().
      if (!reveal) {
        out.body = '';
        out.attachment = null;
      }
    }
    return out;
  }

  getMessage(id) {
    const r = this.get('SELECT * FROM messages WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)', id, Date.now());
    return r ? this._messageOut(r, this._reactions([id])) : null;
  }

  findByClientId(conversationId, senderId, clientId) {
    const r = this.get(
      'SELECT id FROM messages WHERE conversation_id = ? AND sender_id = ? AND client_id = ?',
      conversationId, senderId, clientId,
    );
    return r ? this.getMessage(r.id) : null;
  }

  insertMessage({ conversationId, senderId, kind, body, replyTo, attachment, clientId, meta, viewOnce }) {
    const id = randomUUID();
    const t = Date.now();
    this.tx(() => {
      const c = this.get('SELECT last_seq, ttl_seconds FROM conversations WHERE id = ?', conversationId);
      const seq = c.last_seq + 1;
      this.run('UPDATE conversations SET last_seq = ?, updated_at = ? WHERE id = ?', seq, t, conversationId);
      this.run(
        `INSERT INTO messages (id, conversation_id, seq, sender_id, kind, body, reply_to, attachment, client_id, created_at, expires_at, meta, view_once)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, conversationId, seq, senderId, kind, body, replyTo ?? null,
        attachment ? JSON.stringify(attachment) : null, clientId ?? null, t,
        c.ttl_seconds ? t + c.ttl_seconds * 1000 : null,
        meta && Object.keys(meta).length ? JSON.stringify(meta) : null, viewOnce ? 1 : 0,
      );
      if (attachment) this.run('UPDATE files SET message_id = ? WHERE id = ?', id, attachment.fileId);
      // Your own message is never unread for you.
      this.run('UPDATE members SET last_read_seq = ? WHERE conversation_id = ? AND user_id = ?', seq, conversationId, senderId);
    });
    return this.getMessage(id);
  }

  /** A page of messages: the latest, those `before` a seq, or those `after` one. */
  listMessages(conversationId, { before, after, limit, userId }) {
    const rows = after !== undefined
      ? this.all(
        `SELECT * FROM messages WHERE conversation_id = ? AND seq > ? AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY seq LIMIT ?`,
        conversationId, after, Date.now(), limit,
      )
      : this.all(
        `SELECT * FROM messages WHERE conversation_id = ? AND seq < ? AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY seq DESC LIMIT ?`,
        conversationId, before ?? Number.MAX_SAFE_INTEGER, Date.now(), limit,
      ).reverse();
    const reactions = this._reactions(rows.map((r) => r.id));
    const starred = userId ? this._starred(userId, rows.map((r) => r.id)) : null;
    return rows.map((r) => ({ ...this._messageOut(r, reactions), ...(starred && { starred: starred.has(r.id) }) }));
  }

  /** Messages that carry a file, newest first, for a conversation's media view. */
  listAttachments(conversationId, limit = 100) {
    const rows = this.all(
      `SELECT * FROM messages WHERE conversation_id = ? AND attachment IS NOT NULL AND view_once = 0
         AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY seq DESC LIMIT ?`,
      conversationId, Date.now(), limit,
    );
    return rows.map((r) => this._messageOut(r));
  }

  // ---- starred messages: a private bookmark list ----

  _starred(userId, messageIds) {
    if (!messageIds.length) return new Set();
    return new Set(this.db
      .prepare(`SELECT message_id FROM stars WHERE user_id = ? AND message_id IN (${messageIds.map(() => '?').join(',')})`)
      .all(userId, ...messageIds).map((r) => r.message_id));
  }

  setStar(userId, messageId, on) {
    if (on) this.run('INSERT OR IGNORE INTO stars (user_id, message_id, at) VALUES (?, ?, ?)', userId, messageId, Date.now());
    else this.run('DELETE FROM stars WHERE user_id = ? AND message_id = ?', userId, messageId);
  }

  /** Only messages in conversations the person still belongs to. */
  listStarred(userId, limit = 100) {
    const rows = this.all(
      `SELECT m.* FROM stars s JOIN messages m ON m.id = s.message_id
       JOIN members mb ON mb.conversation_id = m.conversation_id AND mb.user_id = s.user_id
       WHERE s.user_id = ? AND m.deleted_at IS NULL AND (m.expires_at IS NULL OR m.expires_at > ?)
       ORDER BY s.at DESC LIMIT ?`,
      userId, Date.now(), limit,
    );
    const reactions = this._reactions(rows.map((r) => r.id));
    return rows.map((r) => ({ ...this._messageOut(r, reactions), starred: true }));
  }

  // ---- privacy, suspension, usage ----

  privacy(userId) {
    const r = this.get('SELECT hide_read, hide_presence FROM users WHERE id = ?', userId);
    return { readReceipts: !r?.hide_read, presence: !r?.hide_presence };
  }

  setPrivacy(userId, { readReceipts, presence }) {
    if (readReceipts !== undefined) this.run('UPDATE users SET hide_read = ? WHERE id = ?', readReceipts ? 0 : 1, userId);
    if (presence !== undefined) this.run('UPDATE users SET hide_presence = ? WHERE id = ?', presence ? 0 : 1, userId);
    return this.privacy(userId);
  }

  /** The reason a user is suspended, or null. */
  suspension(userId) {
    return this.get('SELECT suspended FROM users WHERE id = ?', userId)?.suspended ?? null;
  }

  setSuspension(userId, reason) {
    return this.run('UPDATE users SET suspended = ? WHERE id = ?', reason, userId).changes > 0;
  }

  storageUsed(userId) {
    return this.get('SELECT COALESCE(SUM(size), 0) AS n FROM files WHERE owner_id = ?', userId).n;
  }

  stats() {
    const n = (sql) => this.get(sql).n;
    return {
      users: n('SELECT COUNT(*) AS n FROM users'),
      conversations: n('SELECT COUNT(*) AS n FROM conversations'),
      messages: n('SELECT COUNT(*) AS n FROM messages'),
      files: n('SELECT COUNT(*) AS n FROM files'),
      fileBytes: n('SELECT COALESCE(SUM(size), 0) AS n FROM files'),
      openReports: n('SELECT COUNT(*) AS n FROM reports'),
    };
  }

  /** What a person has not read yet, for the host's own email or push digests. */
  unreadSummary(userId) {
    const rows = this.all(
      `SELECT c.id, c.type, c.title, c.last_seq - m.last_read_seq AS unread, m.muted FROM members m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.user_id = ? AND c.last_seq > m.last_read_seq ORDER BY c.updated_at DESC`,
      userId,
    );
    return {
      total: rows.reduce((sum, r) => sum + (r.muted ? 0 : r.unread), 0),
      conversations: rows.map((r) => ({ id: r.id, type: r.type, title: r.title, unread: r.unread, muted: !!r.muted })),
    };
  }

  editMessage(id, body) {
    this.run('UPDATE messages SET body = ?, edited_at = ? WHERE id = ?', body, Date.now(), id);
    return this.getMessage(id);
  }

  /** Soft delete: the content is wiped, a tombstone stays so threads keep their shape. */
  deleteMessage(id) {
    const fileId = this._attachmentFileId(id);
    this.tx(() => {
      this.run("UPDATE messages SET body = '', attachment = NULL, meta = NULL, pinned_at = NULL, deleted_at = ? WHERE id = ?", Date.now(), id);
      this.run('DELETE FROM reactions WHERE message_id = ?', id);
      this.run('DELETE FROM votes WHERE message_id = ?', id);
      if (fileId) this.run('DELETE FROM files WHERE id = ?', fileId);
    });
    return fileId;
  }

  _attachmentFileId(messageId) {
    const r = this.get('SELECT attachment FROM messages WHERE id = ?', messageId);
    return r?.attachment ? JSON.parse(r.attachment).fileId : null;
  }

  setReaction(messageId, userId, emoji, on) {
    if (on) this.run('INSERT OR IGNORE INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)', messageId, userId, emoji);
    else this.run('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', messageId, userId, emoji);
    return this._reactions([messageId]).get(messageId) ?? {};
  }

  markRead(conversationId, userId, seq) {
    const r = this.run(
      `UPDATE members SET last_read_seq = MIN(?, (SELECT last_seq FROM conversations WHERE id = ?))
       WHERE conversation_id = ? AND user_id = ? AND last_read_seq < ?`,
      seq, conversationId, conversationId, userId, seq,
    );
    return r.changes > 0;
  }

  /** Hard-delete disappearing messages whose time is up. */
  sweepExpired() {
    const rows = this.all('SELECT id, conversation_id, attachment FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ?', Date.now());
    if (!rows.length) return [];
    this.tx(() => {
      for (const r of rows) {
        this.run('DELETE FROM messages WHERE id = ?', r.id);
        if (r.attachment) this.run('DELETE FROM files WHERE id = ?', JSON.parse(r.attachment).fileId);
      }
    });
    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      fileId: r.attachment ? JSON.parse(r.attachment).fileId : null,
    }));
  }

  // ---- pins, polls, view-once, search ----

  pinMessage(id, userId) {
    this.run('UPDATE messages SET pinned_at = ?, pinned_by = ? WHERE id = ?', userId ? Date.now() : null, userId, id);
    return this.getMessage(id);
  }

  listPins(conversationId) {
    const rows = this.all(
      'SELECT * FROM messages WHERE conversation_id = ? AND pinned_at IS NOT NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY pinned_at DESC LIMIT 50',
      conversationId, Date.now(),
    );
    const reactions = this._reactions(rows.map((r) => r.id));
    return rows.map((r) => this._messageOut(r, reactions));
  }

  /** Replace one voter's choices on a poll. */
  vote(messageId, userId, options) {
    this.tx(() => {
      this.run('DELETE FROM votes WHERE message_id = ? AND user_id = ?', messageId, userId);
      for (const o of options) this.run('INSERT INTO votes (message_id, user_id, option) VALUES (?, ?, ?)', messageId, userId, o);
    });
    return this.getMessage(messageId);
  }

  /** Release a view-once message to one recipient, exactly once. Returns null if they already opened it. */
  openMessage(id, userId) {
    const r = this.run('INSERT OR IGNORE INTO opens (message_id, user_id, at) VALUES (?, ?, ?)', id, userId, Date.now());
    if (!r.changes) return null;
    const row = this.get('SELECT * FROM messages WHERE id = ?', id);
    return this._messageOut(row, this._reactions([id]), { reveal: true });
  }

  openedWithin(messageId, userId, ms) {
    return !!this.get('SELECT 1 FROM opens WHERE message_id = ? AND user_id = ? AND at > ?', messageId, userId, Date.now() - ms);
  }

  /** Wipe view-once messages every recipient has opened (after a short grace so downloads can finish). */
  sweepViewOnce(graceMs) {
    const cutoff = Date.now() - graceMs;
    const done = [];
    for (const m of this.all('SELECT id, conversation_id, sender_id, attachment FROM messages WHERE view_once = 1 AND consumed_at IS NULL')) {
      const pending = this.get(
        `SELECT 1 FROM members mb WHERE mb.conversation_id = ? AND mb.user_id != ?
           AND NOT EXISTS (SELECT 1 FROM opens o WHERE o.message_id = ? AND o.user_id = mb.user_id AND o.at <= ?)`,
        m.conversation_id, m.sender_id, m.id, cutoff,
      );
      if (pending) continue;
      const fileId = m.attachment ? JSON.parse(m.attachment).fileId : null;
      this.tx(() => {
        this.run("UPDATE messages SET body = '', attachment = NULL, consumed_at = ? WHERE id = ?", Date.now(), m.id);
        if (fileId) this.run('DELETE FROM files WHERE id = ?', fileId);
      });
      done.push({ id: m.id, conversationId: m.conversation_id, fileId });
    }
    return done;
  }

  /** Server-side search. Encrypted conversations are skipped: the server cannot read them. */
  search(userId, q, conversationId, limit = 30) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const rows = this.db.prepare(
      `SELECT m.* FROM messages m
       JOIN members mb ON mb.conversation_id = m.conversation_id AND mb.user_id = ?
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.encrypted = 0 AND m.kind = 'text' AND m.view_once = 0 AND m.deleted_at IS NULL
         AND (m.expires_at IS NULL OR m.expires_at > ?) AND m.body LIKE ? ESCAPE '\\'
         ${conversationId ? 'AND m.conversation_id = ?' : ''}
       ORDER BY m.created_at DESC LIMIT ?`,
    ).all(...[userId, Date.now(), like, conversationId, limit].filter((v) => v !== undefined && v !== null));
    return rows.map((r) => this._messageOut(r));
  }

  // ---- stories: posts that vanish, shown to the people you already chat with ----

  addStory({ userId, text, attachment, ttlSeconds }) {
    const id = randomUUID();
    const t = Date.now();
    this.run('INSERT INTO stories (id, user_id, text, attachment, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      id, userId, text, attachment ? JSON.stringify(attachment) : null, t, t + ttlSeconds * 1000);
    if (attachment) this.run('UPDATE files SET message_id = ? WHERE id = ?', id, attachment.fileId);
    return this.getStory(id, userId);
  }

  _storyOut(r, viewerId) {
    const mine = r.user_id === viewerId;
    const views = this.all('SELECT user_id, at FROM story_views WHERE story_id = ?', r.id);
    return {
      id: r.id, userId: r.user_id, text: r.text, attachment: r.attachment ? JSON.parse(r.attachment) : null,
      createdAt: r.created_at, expiresAt: r.expires_at,
      seen: mine || views.some((v) => v.user_id === viewerId),
      // Only the author learns who watched.
      views: mine ? views.map((v) => ({ userId: v.user_id, at: v.at })) : undefined,
    };
  }

  getStory(id, viewerId) {
    const r = this.get('SELECT * FROM stories WHERE id = ? AND expires_at > ?', id, Date.now());
    return r ? this._storyOut(r, viewerId) : null;
  }

  /** Live stories from this user and their peers, grouped by author, own first. */
  storyFeed(userId) {
    const rows = this.all(
      `SELECT s.*, u.name, u.avatar, u.avatar_file FROM stories s JOIN users u ON u.id = s.user_id
       WHERE s.expires_at > ? AND (s.user_id = ? OR s.user_id IN (
         SELECT m2.user_id FROM members m1 JOIN members m2 ON m2.conversation_id = m1.conversation_id WHERE m1.user_id = ?))
       ORDER BY s.created_at`,
      Date.now(), userId, userId,
    );
    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.user_id)) groups.set(r.user_id, { user: { id: r.user_id, name: r.name, avatar: avatarOf(r.avatar_file, r.avatar) }, stories: [] });
      groups.get(r.user_id).stories.push(this._storyOut(r, userId));
    }
    return [...groups.values()].sort((a, b) => (b.user.id === userId) - (a.user.id === userId));
  }

  viewStory(id, userId) {
    return this.run('INSERT OR IGNORE INTO story_views (story_id, user_id, at) VALUES (?, ?, ?)', id, userId, Date.now()).changes > 0;
  }

  deleteStory(id) {
    const r = this.get('SELECT attachment FROM stories WHERE id = ?', id);
    const fileId = r?.attachment ? JSON.parse(r.attachment).fileId : null;
    this.run('DELETE FROM stories WHERE id = ?', id);
    if (fileId) this.run('DELETE FROM files WHERE id = ?', fileId);
    return fileId;
  }

  sweepStories() {
    return this.all('SELECT id FROM stories WHERE expires_at <= ?', Date.now()).map((r) => this.deleteStory(r.id)).filter(Boolean);
  }

  // ---- calls placed through the host's own call vendor ----

  addCall({ conversationId, startedBy, video }) {
    const id = randomUUID();
    this.run('INSERT INTO calls (id, conversation_id, started_by, video, created_at) VALUES (?, ?, ?, ?, ?)', id, conversationId, startedBy, video ? 1 : 0, Date.now());
    return this.getCall(id);
  }

  getCall(id) {
    const r = this.get('SELECT * FROM calls WHERE id = ?', id);
    return r ? { id: r.id, conversationId: r.conversation_id, startedBy: r.started_by, video: !!r.video, createdAt: r.created_at } : null;
  }

  // ---- invite codes: let people join a group themselves ----

  addInvite({ code, conversationId, createdBy, ttlSeconds, maxUses }) {
    const t = Date.now();
    this.run('INSERT INTO invites (code, conversation_id, created_by, created_at, expires_at, max_uses) VALUES (?, ?, ?, ?, ?, ?)',
      code, conversationId, createdBy, t, ttlSeconds ? t + ttlSeconds * 1000 : null, maxUses ?? null);
    return this.getInvite(code);
  }

  /** A usable invite, or null if unknown, expired or used up. */
  getInvite(code) {
    const r = this.get('SELECT * FROM invites WHERE code = ?', code);
    if (!r || (r.expires_at && r.expires_at <= Date.now()) || (r.max_uses && r.uses >= r.max_uses)) return null;
    return { code: r.code, conversationId: r.conversation_id, createdBy: r.created_by, expiresAt: r.expires_at, maxUses: r.max_uses, uses: r.uses };
  }

  useInvite(code) {
    this.run('UPDATE invites SET uses = uses + 1 WHERE code = ?', code);
  }

  listInvites(conversationId) {
    return this.all('SELECT code FROM invites WHERE conversation_id = ?', conversationId).map((r) => this.getInvite(r.code)).filter(Boolean);
  }

  deleteInvite(code, conversationId) {
    return this.run('DELETE FROM invites WHERE code = ? AND conversation_id = ?', code, conversationId).changes > 0;
  }

  // ---- data portability ----

  /** Everything held about one user, for access and portability requests. */
  exportUser(id) {
    const user = this.getUser(id);
    if (!user) return null;
    const sent = this.all('SELECT * FROM messages WHERE sender_id = ? ORDER BY created_at', id);
    return {
      exportedAt: Date.now(),
      user: { ...user, handles: this.handlesOf(id) },
      conversations: this.all(
        'SELECT c.id, c.type, c.title, c.encrypted, m.role, m.joined_at FROM members m JOIN conversations c ON c.id = m.conversation_id WHERE m.user_id = ?', id,
      ).map((r) => ({ id: r.id, type: r.type, title: r.title, encrypted: !!r.encrypted, role: r.role, joinedAt: r.joined_at })),
      messages: sent.map((r) => this._messageOut(r, undefined, { reveal: true })),
      reactions: this.all('SELECT message_id, emoji FROM reactions WHERE user_id = ?', id).map((r) => ({ messageId: r.message_id, emoji: r.emoji })),
      stories: this.all('SELECT * FROM stories WHERE user_id = ?', id).map((r) => this._storyOut(r, id)),
      files: this.all('SELECT id, name, mime, size, created_at FROM files WHERE owner_id = ?', id).map((r) => ({ fileId: r.id, name: r.name, mime: r.mime, size: r.size, createdAt: r.created_at })),
      blocked: this.blocks(id),
    };
  }

  // ---- scheduled messages: held until their time, then sent as their author ----

  _scheduledOut(r) {
    return { id: r.id, conversationId: r.conversation_id, sendAt: r.send_at, message: JSON.parse(r.payload), error: r.error };
  }

  addScheduled({ conversationId, senderId, payload, sendAt }) {
    const id = randomUUID();
    this.run('INSERT INTO scheduled (id, conversation_id, sender_id, payload, send_at) VALUES (?, ?, ?, ?, ?)', id, conversationId, senderId, JSON.stringify(payload), sendAt);
    return this._scheduledOut(this.get('SELECT * FROM scheduled WHERE id = ?', id));
  }

  listScheduled(senderId) {
    return this.all('SELECT * FROM scheduled WHERE sender_id = ? ORDER BY send_at', senderId).map((r) => this._scheduledOut(r));
  }

  countScheduled(senderId) {
    return this.get('SELECT COUNT(*) AS n FROM scheduled WHERE sender_id = ? AND error IS NULL', senderId).n;
  }

  deleteScheduled(id, senderId) {
    return this.run('DELETE FROM scheduled WHERE id = ? AND sender_id = ?', id, senderId).changes > 0;
  }

  /** Take the messages whose time has come. Each is claimed first, so two instances never both send it. */
  claimDueScheduled(leaseMs = 60_000) {
    const t = Date.now();
    const out = [];
    for (const r of this.all('SELECT * FROM scheduled WHERE send_at <= ? AND error IS NULL LIMIT 20', t)) {
      const mine = this.run('UPDATE scheduled SET send_at = ? WHERE id = ? AND send_at = ?', t + leaseMs, r.id, r.send_at).changes > 0;
      if (mine) out.push({ ...this._scheduledOut(r), senderId: r.sender_id });
    }
    return out;
  }

  failScheduled(id, error) {
    this.run('UPDATE scheduled SET error = ? WHERE id = ?', error, id);
  }

  finishScheduled(id) {
    this.run('DELETE FROM scheduled WHERE id = ?', id);
  }

  // ---- audit trail: what was done with admin rights, by which token subject ----

  addAudit(actor, action) {
    this.run('INSERT INTO audit (actor, action, at) VALUES (?, ?, ?)', actor, action, Date.now());
    // Keep the trail bounded: the most recent 20,000 entries.
    this.run('DELETE FROM audit WHERE id <= (SELECT MAX(id) FROM audit) - 20000');
  }

  listAudit(limit = 100) {
    return this.all('SELECT actor, action, at FROM audit ORDER BY id DESC LIMIT ?', limit);
  }

  /** A consistent copy of the database in one file, safe to take while running. */
  backupTo(file) {
    if (this.postgres) throw new Error('This PlugChat keeps its data in PostgreSQL: back it up with pg_dump.');
    this.db.prepare('VACUUM INTO ?').run(file);
  }

  // ---- key backups: opaque to the server, opened only by the owner's passphrase ----

  getBackup(userId) {
    const r = this.get('SELECT salt, data, updated_at FROM key_backups WHERE user_id = ?', userId);
    return r ? { salt: r.salt, data: r.data, updatedAt: r.updated_at } : null;
  }

  setBackup(userId, salt, data) {
    this.run(
      `INSERT INTO key_backups (user_id, salt, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET salt = excluded.salt, data = excluded.data, updated_at = excluded.updated_at`,
      userId, salt, data, Date.now(),
    );
  }

  deleteBackup(userId) {
    return this.run('DELETE FROM key_backups WHERE user_id = ?', userId).changes > 0;
  }

  // ---- webhook queue: events wait here until the host has accepted them ----

  enqueueWebhook(body) {
    return Number(this.run('INSERT INTO webhook_queue (body, attempts, next_at) VALUES (?, 0, 0)', body).lastInsertRowid);
  }

  /** Take a due job for `leaseMs`; returns null if another instance has it. */
  claimWebhook(id, leaseMs) {
    const t = Date.now();
    const claimed = this.run('UPDATE webhook_queue SET next_at = ? WHERE id = ? AND next_at <= ?', t + leaseMs, id, t).changes > 0;
    return claimed ? this.get('SELECT body, attempts FROM webhook_queue WHERE id = ?', id) : null;
  }

  finishWebhook(id) {
    this.run('DELETE FROM webhook_queue WHERE id = ?', id);
  }

  retryWebhook(id, attempts, delayMs) {
    this.run('UPDATE webhook_queue SET attempts = ?, next_at = ? WHERE id = ?', attempts, Date.now() + delayMs, id);
  }

  dueWebhooks(limit = 20) {
    return this.all('SELECT id FROM webhook_queue WHERE next_at <= ? ORDER BY id LIMIT ?', Date.now(), limit).map((r) => r.id);
  }

  /** Retention: hard-delete everything sent before `cutoff`. Returns file ids to unlink. */
  purgeOlderThan(cutoff) {
    const files = this.all(
      'SELECT f.id FROM files f JOIN messages m ON m.id = f.message_id WHERE m.created_at < ?', cutoff,
    ).map((r) => r.id);
    this.tx(() => {
      for (const id of files) this.run('DELETE FROM files WHERE id = ?', id);
      this.run('DELETE FROM messages WHERE created_at < ?', cutoff);
    });
    return files;
  }

  // ---- reports ----

  addReport({ messageId, conversationId, reporterId, reason, snapshot }) {
    const id = randomUUID();
    this.run('INSERT INTO reports (id, message_id, conversation_id, reporter_id, reason, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, messageId, conversationId, reporterId, reason, JSON.stringify(snapshot), Date.now());
    return id;
  }

  deleteReport(id) {
    return this.run('DELETE FROM reports WHERE id = ?', id).changes > 0;
  }

  listReports(limit = 100) {
    return this.all('SELECT * FROM reports ORDER BY created_at DESC LIMIT ?', limit).map((r) => ({
      id: r.id, messageId: r.message_id, conversationId: r.conversation_id, reporterId: r.reporter_id,
      reason: r.reason, message: JSON.parse(r.snapshot), createdAt: r.created_at,
    }));
  }

  // ---- files ----

  addFile({ id, conversationId, ownerId, name, mime, size }) {
    this.run(
      'INSERT INTO files (id, conversation_id, owner_id, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, conversationId ?? null, ownerId, name, mime, size, Date.now(),
    );
  }

  getFile(id) {
    const r = this.get('SELECT * FROM files WHERE id = ?', id);
    return r ? { id: r.id, conversationId: r.conversation_id, messageId: r.message_id, ownerId: r.owner_id, name: r.name, mime: r.mime, size: r.size } : null;
  }

  /** Uploads that were never attached to anything. */
  sweepOrphanFiles(olderThanMs) {
    const rows = this.all('SELECT id FROM files WHERE message_id IS NULL AND created_at < ?', Date.now() - olderThanMs);
    for (const r of rows) this.run('DELETE FROM files WHERE id = ?', r.id);
    return rows.map((r) => r.id);
  }
}
