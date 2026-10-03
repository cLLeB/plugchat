import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

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
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
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
  UNIQUE (conversation_id, seq)
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
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
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

const userOut = (r) => r && { id: r.id, name: r.name, avatar: r.avatar, publicKey: r.public_key, lastSeen: r.last_seen };

export class Store {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.db.exec(SCHEMA);
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

  searchUsers(q, excludeId, limit = 20) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    return this.all(
      `SELECT * FROM users WHERE id != ? AND (name LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')
       ORDER BY name LIMIT ?`,
      excludeId, like, like, limit,
    ).map(userOut);
  }

  setPublicKey(id, key) {
    this.run('UPDATE users SET public_key = ? WHERE id = ?', key, id);
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

  createConversation({ id, type, title, creator, memberIds, encrypted, ttlSeconds, keys }) {
    const t = Date.now();
    const cid = id ?? randomUUID();
    this.tx(() => {
      this.run(
        `INSERT INTO conversations (id, type, title, dm_key, encrypted, ttl_seconds, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        cid, type, title ?? null, type === 'dm' ? Store.dmKey(memberIds[0], memberIds[1]) : null,
        encrypted ? 1 : 0, ttlSeconds ?? null, creator, t, t,
      );
      for (const uid of memberIds) {
        const role = type === 'group' && uid === creator ? 'owner' : 'member';
        this.run(
          'INSERT INTO members (conversation_id, user_id, role, wrapped_key, joined_at) VALUES (?, ?, ?, ?, ?)',
          cid, uid, role, keys?.[uid] ? JSON.stringify(keys[uid]) : null, t,
        );
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
      `SELECT m.user_id, m.role, m.last_read_seq, m.wrapped_key, u.name, u.avatar, u.public_key
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
      encrypted: !!c.encrypted,
      ttlSeconds: c.ttl_seconds,
      createdBy: c.created_by,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      lastSeq: c.last_seq,
      unread: me ? Math.max(0, c.last_seq - me.last_read_seq) : 0,
      wrappedKey: me?.wrapped_key ? JSON.parse(me.wrapped_key) : null,
      members: rows.map((r) => ({
        userId: r.user_id, name: r.name, avatar: r.avatar, role: r.role,
        lastReadSeq: r.last_read_seq, publicKey: r.public_key,
      })),
      lastMessage: last ? this._messageOut(last, this._reactions([last.id])) : null,
    };
  }

  listConversations(userId, limit = 200) {
    return this.all(
      `SELECT c.id FROM conversations c JOIN members m ON m.conversation_id = c.id
       WHERE m.user_id = ? ORDER BY c.updated_at DESC LIMIT ?`,
      userId, limit,
    ).map((r) => this.conversationFor(r.id, userId));
  }

  updateConversation(id, { title, ttlSeconds }) {
    if (title !== undefined) this.run('UPDATE conversations SET title = ? WHERE id = ?', title, id);
    if (ttlSeconds !== undefined) this.run('UPDATE conversations SET ttl_seconds = ? WHERE id = ?', ttlSeconds, id);
  }

  addMembers(conversationId, userIds, keys) {
    const t = Date.now();
    this.tx(() => {
      for (const uid of userIds) {
        this.run(
          'INSERT OR IGNORE INTO members (conversation_id, user_id, role, wrapped_key, joined_at) VALUES (?, ?, ?, ?, ?)',
          conversationId, uid, 'member', keys?.[uid] ? JSON.stringify(keys[uid]) : null, t,
        );
      }
    });
  }

  removeMember(conversationId, userId) {
    this.run('DELETE FROM members WHERE conversation_id = ? AND user_id = ?', conversationId, userId);
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

  _messageOut(r, reactions) {
    return {
      id: r.id,
      conversationId: r.conversation_id,
      seq: r.seq,
      senderId: r.sender_id,
      kind: r.kind,
      body: r.body,
      replyTo: r.reply_to,
      attachment: r.attachment ? JSON.parse(r.attachment) : null,
      clientId: r.client_id,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      deleted: !!r.deleted_at,
      expiresAt: r.expires_at,
      reactions: reactions?.get(r.id) ?? {},
    };
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

  insertMessage({ conversationId, senderId, kind, body, replyTo, attachment, clientId }) {
    const id = randomUUID();
    const t = Date.now();
    this.tx(() => {
      const c = this.get('SELECT last_seq, ttl_seconds FROM conversations WHERE id = ?', conversationId);
      const seq = c.last_seq + 1;
      this.run('UPDATE conversations SET last_seq = ?, updated_at = ? WHERE id = ?', seq, t, conversationId);
      this.run(
        `INSERT INTO messages (id, conversation_id, seq, sender_id, kind, body, reply_to, attachment, client_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, conversationId, seq, senderId, kind, body, replyTo ?? null,
        attachment ? JSON.stringify(attachment) : null, clientId ?? null, t,
        c.ttl_seconds ? t + c.ttl_seconds * 1000 : null,
      );
      // Your own message is never unread for you.
      this.run('UPDATE members SET last_read_seq = ? WHERE conversation_id = ? AND user_id = ?', seq, conversationId, senderId);
    });
    return this.getMessage(id);
  }

  listMessages(conversationId, { before, limit }) {
    const rows = this.all(
      `SELECT * FROM messages WHERE conversation_id = ? AND seq < ? AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY seq DESC LIMIT ?`,
      conversationId, before ?? Number.MAX_SAFE_INTEGER, Date.now(), limit,
    ).reverse();
    const reactions = this._reactions(rows.map((r) => r.id));
    return rows.map((r) => this._messageOut(r, reactions));
  }

  editMessage(id, body) {
    this.run('UPDATE messages SET body = ?, edited_at = ? WHERE id = ?', body, Date.now(), id);
    return this.getMessage(id);
  }

  /** Soft delete: the content is wiped, a tombstone stays so threads keep their shape. */
  deleteMessage(id) {
    const fileId = this._attachmentFileId(id);
    this.tx(() => {
      this.run("UPDATE messages SET body = '', attachment = NULL, deleted_at = ? WHERE id = ?", Date.now(), id);
      this.run('DELETE FROM reactions WHERE message_id = ?', id);
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

  // ---- files ----

  addFile({ id, conversationId, ownerId, name, mime, size }) {
    this.run(
      'INSERT INTO files (id, conversation_id, owner_id, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, conversationId, ownerId, name, mime, size, Date.now(),
    );
  }

  getFile(id) {
    const r = this.get('SELECT * FROM files WHERE id = ?', id);
    return r ? { id: r.id, conversationId: r.conversation_id, ownerId: r.owner_id, name: r.name, mime: r.mime, size: r.size } : null;
  }
}
