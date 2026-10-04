// PlugChat headless client. No dependencies, no build step: works as an ES
// module in any browser or WebView, and in Node >= 22 for bots and tests.
import * as e2ee from './e2ee.js';

export class PlugChatError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const tokenExpiry = (token) => {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000;
  } catch {
    return 0;
  }
};

export class PlugChat {
  /**
   * @param {object} options
   * @param {string} options.url        Where PlugChat is mounted, e.g. https://chat.example.com/plugchat
   * @param {string} [options.token]    A user token minted by the host backend.
   * @param {() => Promise<string>} [options.getToken]  Preferred: fetches a fresh token whenever one is needed.
   * @param {boolean} [options.e2ee]    Set up this device for end-to-end encryption. Default true
   */
  constructor({ url, token, getToken, e2ee: useE2ee = true, keyStore } = {}) {
    if (!url) throw new Error('PlugChat: `url` is required');
    if (!token && !getToken) throw new Error('PlugChat: pass `token` or `getToken`');
    this.url = url.replace(/\/+$/, '');
    this.getToken = getToken ?? (async () => token);
    this.useE2ee = useE2ee;
    this.keyStore = keyStore ?? e2ee.defaultKeyStore();
    this.me = null;
    this.identity = null;
    this.online = new Set();
    this._token = null;
    this._listeners = new Map();
    this._convs = new Map();
    this._keys = new Map(); // "conversationId:epoch" -> Promise<{ epoch, raw, key } | null>
    this._sharing = new Set();
    this._closed = false;
    this._retry = 0;
  }

  on(type, fn) {
    let set = this._listeners.get(type);
    if (!set) this._listeners.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  _emit(type, payload) {
    for (const fn of this._listeners.get(type) ?? []) {
      try {
        fn(payload);
      } catch (e) {
        console.error('plugchat listener failed', e);
      }
    }
  }

  async _freshToken(force) {
    if (force || !this._token || tokenExpiry(this._token) < Date.now() + 5000) this._token = await this.getToken();
    return this._token;
  }

  async _req(method, path, { json, body, headers = {}, blob = false } = {}, retried = false) {
    const res = await fetch(`${this.url}/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await this._freshToken(retried)}`,
        ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : body,
    });
    if (res.status === 401 && !retried) return this._req(method, path, { json, body, headers, blob }, true);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new PlugChatError(res.status, err.error ?? 'error', err.message ?? res.statusText);
    }
    return blob ? res.arrayBuffer() : res.json();
  }

  // ---- lifecycle ----

  async connect() {
    this.me = await this._req('GET', '/me');
    if (this.useE2ee) {
      this.identity = await e2ee.loadIdentity(this.keyStore, `identity:${this.url}:${this.me.id}`);
      this.me = await this._req('PUT', '/me/key', { json: { deviceId: this.identity.deviceId, publicKey: this.identity.publicKey } });
    }
    await this._openSocket();
    return this.me;
  }

  close() {
    this._closed = true;
    clearTimeout(this._refreshTimer);
    clearTimeout(this._retryTimer);
    clearTimeout(this._backupTimer);
    this._ws?.close();
  }

  _openSocket() {
    return new Promise((resolve) => {
      if (this._closed) return resolve();
      const ws = new WebSocket(this.url.replace(/^http/, 'ws') + '/v1/ws');
      this._ws = ws;
      ws.onopen = async () => {
        try {
          const token = await this._freshToken(this._retry > 0);
          ws.send(JSON.stringify({ type: 'auth', token }));
          this._scheduleRefresh(token);
        } catch {
          ws.close();
        }
      };
      ws.onmessage = (ev) => {
        const event = JSON.parse(ev.data);
        if (event.type === 'ready') {
          const again = this._retry > 0;
          this._retry = 0;
          this.online = new Set(event.online);
          this._emit('connection', { state: 'connected', reconnected: again });
          resolve();
        } else {
          this._onEvent(event).catch((e) => console.error('plugchat event failed', e));
        }
      };
      ws.onclose = () => {
        clearTimeout(this._refreshTimer);
        resolve();
        if (this._closed) return;
        this._emit('connection', { state: 'disconnected' });
        const delay = Math.min(30_000, 1000 * 2 ** this._retry++) * (0.5 + Math.random() / 2);
        this._retryTimer = setTimeout(() => this._openSocket(), delay);
      };
      ws.onerror = () => {};
    });
  }

  // The server drops a socket when its token expires, so re-authenticate just before.
  _scheduleRefresh(token) {
    clearTimeout(this._refreshTimer);
    const exp = tokenExpiry(token);
    if (!exp) return;
    this._refreshTimer = setTimeout(async () => {
      try {
        const next = await this._freshToken(true);
        if (this._ws?.readyState === 1 && tokenExpiry(next) > exp) {
          this._ws.send(JSON.stringify({ type: 'auth', token: next }));
          this._scheduleRefresh(next);
        }
      } catch {
        // the socket will close on expiry and the reconnect loop takes over
      }
    }, Math.max(1000, Math.min(exp - Date.now() - 30_000, 2 ** 31 - 1)));
  }

  async _onEvent(event) {
    switch (event.type) {
      case 'message.new':
      case 'message.updated': {
        const message = await this._hydrate(event.message);
        const conv = this._convs.get(message.conversationId);
        if (conv && event.type === 'message.new') {
          conv.lastSeq = Math.max(conv.lastSeq, message.seq);
          conv.lastMessage = message;
          conv.updatedAt = message.createdAt;
          if (message.senderId !== this.me.id) conv.unread += 1;
          // Sending implies having read everything before it.
          const sender = conv.members.find((m) => m.userId === message.senderId);
          if (sender) sender.lastReadSeq = Math.max(sender.lastReadSeq, message.seq);
        } else if (conv?.lastMessage?.id === message.id) {
          conv.lastMessage = message;
        }
        return this._emit(event.type === 'message.new' ? 'message' : 'message.updated', message);
      }
      case 'conversation.new':
      case 'conversation.updated':
        return this._emit('conversation', await this._hydrateConversation(event.conversation));
      case 'conversation.removed':
        this._convs.delete(event.conversationId);
        for (const slot of this._keys.keys()) if (slot.startsWith(event.conversationId + ':')) this._keys.delete(slot);
        return this._emit('conversation.removed', event);
      case 'presence':
        if (event.online) this.online.add(event.userId);
        else this.online.delete(event.userId);
        return this._emit('presence', event);
      case 'read': {
        const member = this._convs.get(event.conversationId)?.members.find((m) => m.userId === event.userId);
        if (member) member.lastReadSeq = event.seq;
        if (event.userId === this.me.id && this._convs.has(event.conversationId)) {
          const conv = this._convs.get(event.conversationId);
          conv.unread = Math.max(0, conv.lastSeq - event.seq);
        }
        return this._emit('read', event);
      }
      default:
        return this._emit(event.type, event);
    }
  }

  // ---- encryption plumbing ----

  /** The key for one epoch of a conversation, or null if this device was never given it. */
  _epochKey(conv, epoch) {
    const slot = `${conv.id}:${epoch}`;
    let p = this._keys.get(slot);
    if (!p) {
      p = (async () => {
        const wrapped = this.identity && conv.wrappedKeys?.[this.identity.deviceId]?.[epoch];
        if (!wrapped) return null;
        try {
          return { epoch, ...(await e2ee.unwrapKey(this.identity, wrapped, conv.id)) };
        } catch {
          // It does not open (damaged, or forged by someone in the conversation):
          // discard it so that an honest member's device can supply a working one.
          this._req('DELETE', `/conversations/${conv.id}/keys/${encodeURIComponent(this.identity.deviceId)}/${epoch}`).catch(() => {});
          return null;
        }
      })();
      this._keys.set(slot, p);
      // A miss can be filled later, when another device shares the key with this one.
      p.then((k) => (k ? this._backupSoon() : this._keys.delete(slot)));
    }
    return p;
  }

  /** Every epoch key this device holds for a conversation. */
  async _heldKeys(conv) {
    const epochs = Object.keys(conv.wrappedKeys?.[this.identity?.deviceId] ?? {}).map(Number);
    return (await Promise.all(epochs.map((e) => this._epochKey(conv, e)))).filter(Boolean);
  }

  /** The key to encrypt with right now. Replaces the key first if someone has left. */
  async _requireKey(conv) {
    if (conv.rotatePending) conv = await this.rotateKey(conv.id);
    const k = await this._epochKey(conv, conv.keyEpoch);
    if (!k) throw new PlugChatError(0, 'no_key', 'This device has not been given the key for this conversation yet. It arrives as soon as another member is online.');
    return k;
  }

  async _devicesOf(userIds) {
    const out = [];
    for (const id of userIds) {
      const { devices } = await this._req('GET', `/users/${encodeURIComponent(id)}/devices`);
      if (!devices.length) {
        const name = await this.user(id).then((u) => u.name, () => 'This person');
        throw new PlugChatError(409, 'no_public_key', `${name} has not opened chat yet, so encryption cannot be set up with them`);
      }
      out.push(...devices.map((d) => ({ userId: id, ...d })));
    }
    return out;
  }

  /** Wrap each held key for each device: [{ userId, deviceId, epoch, by, byKey, data }]. */
  async _wrapForDevices(conversationId, held, devices) {
    if (!this.identity) throw new PlugChatError(0, 'e2ee_disabled', 'End-to-end encryption is not enabled on this client');
    const keys = [];
    for (const d of devices) {
      for (const k of held) {
        keys.push({ userId: d.userId, deviceId: d.deviceId, epoch: k.epoch, ...(await e2ee.wrapKey(this.identity, this.me.id, d.publicKey, conversationId, k.raw)) });
      }
    }
    return keys;
  }

  // Give the keys this device holds to member devices that have none yet: a
  // person's new phone, or a device that was offline when the key changed.
  async _shareKeys(conv) {
    if (!conv.encrypted || !this.identity || this._sharing.has(conv.id)) return;
    const needy = conv.members.flatMap((m) => (m.devices ?? []).filter((d) => !d.keyed && d.deviceId !== this.identity.deviceId).map((d) => ({ userId: m.userId, ...d })));
    if (!needy.length) return;
    const held = await this._heldKeys(conv);
    if (!held.some((k) => k.epoch === conv.keyEpoch)) return;
    this._sharing.add(conv.id);
    try {
      await this._req('POST', `/conversations/${conv.id}/keys`, { json: { keys: await this._wrapForDevices(conv.id, held, needy) } });
    } finally {
      this._sharing.delete(conv.id);
    }
  }

  /**
   * Replace a conversation's key. Happens automatically before the first
   * message after someone leaves; call it yourself to rotate on a schedule.
   */
  async rotateKey(conversationId) {
    const conv = await this.conversation(conversationId);
    if (!conv.encrypted) return conv;
    const fresh = await e2ee.newConversationKey();
    const epoch = conv.keyEpoch + 1;
    const devices = conv.members.flatMap((m) => m.devices.map((d) => ({ userId: m.userId, ...d })));
    const keys = await this._wrapForDevices(conv.id, [{ epoch, raw: fresh.raw }], devices);
    let updated;
    try {
      updated = await this._req('POST', `/conversations/${conv.id}/rotate`, { json: { epoch, keys } });
    } catch (e) {
      if (e.code === 'stale_epoch') return this.conversation(conversationId); // another member got there first
      throw e;
    }
    this._keys.set(`${conv.id}:${epoch}`, Promise.resolve({ epoch, ...fresh }));
    this._backupSoon();
    return this._hydrateConversation(updated);
  }

  // ---- key backup: get encrypted history back after losing a device ----

  _backupSlot() {
    return `backup:${this.url}:${this.me.id}`;
  }

  /** `{ exists, enabledHere }`: is there a backup on the server, and does this device keep it up to date? */
  async backupStatus() {
    const exists = await this._req('GET', '/me/backup').then(() => true, (e) => (e.status === 404 ? false : Promise.reject(e)));
    return { exists, enabledHere: exists && !!(await this.keyStore.get(this._backupSlot())) };
  }

  /**
   * Protect this person's conversation keys with a passphrase and store the
   * result on the server, which cannot open it. Choose a long passphrase:
   * whoever holds the stored copy can try guesses against it offline.
   */
  async enableBackup(passphrase) {
    if (!this.identity) throw new PlugChatError(0, 'e2ee_disabled', 'End-to-end encryption is not enabled on this client');
    if (typeof passphrase !== 'string' || passphrase.length < 8) throw new PlugChatError(0, 'weak_passphrase', 'Use a passphrase of at least 8 characters');
    const salt = e2ee.newBackupSalt();
    await this.keyStore.set(this._backupSlot(), { salt, key: await e2ee.deriveBackupKey(passphrase, salt) });
    await this._uploadBackup();
  }

  async _uploadBackup() {
    const backup = await this.keyStore.get(this._backupSlot());
    if (!backup) return;
    const keys = {};
    for (const conv of await this.conversations()) {
      if (!conv.encrypted) continue;
      for (const k of await this._heldKeys(conv)) (keys[conv.id] ??= {})[k.epoch] = e2ee.b64(k.raw);
    }
    await this._req('PUT', '/me/backup', { json: { salt: backup.salt, data: await e2ee.sealBackup(backup.key, { v: 1, keys }) } });
  }

  // New keys (a new conversation, a rotation) are added to the backup shortly after they appear.
  _backupSoon() {
    clearTimeout(this._backupTimer);
    this._backupTimer = setTimeout(() => this._uploadBackup().catch(() => {}), 3000);
  }

  /**
   * Bring the keys from the server-side backup onto this device. Rejects with
   * code 'wrong_passphrase' if the passphrase does not open it. Resolves with
   * the number of conversations restored.
   */
  async restoreBackup(passphrase) {
    const stored = await this._req('GET', '/me/backup');
    const key = await e2ee.deriveBackupKey(passphrase, stored.salt);
    let content;
    try {
      content = await e2ee.openBackup(key, stored.data);
    } catch {
      throw new PlugChatError(0, 'wrong_passphrase', 'That passphrase does not open the backup');
    }
    let restored = 0;
    for (const [conversationId, epochs] of Object.entries(content.keys)) {
      const conv = await this.conversation(conversationId).catch(() => null);
      if (!conv) continue; // no longer a member
      const held = Object.entries(epochs).map(([epoch, raw]) => ({ epoch: Number(epoch), raw: e2ee.unb64(raw) }));
      // Re-wrap for this device, so from now on it holds the keys like any other.
      const mine = [{ userId: this.me.id, deviceId: this.identity.deviceId, publicKey: this.identity.publicKey }];
      await this._req('POST', `/conversations/${conversationId}/keys`, { json: { keys: await this._wrapForDevices(conversationId, held, mine) } });
      for (const slot of [...this._keys.keys()]) if (slot.startsWith(conversationId + ':')) this._keys.delete(slot);
      await this.conversation(conversationId);
      restored += 1;
    }
    await this.keyStore.set(this._backupSlot(), { salt: stored.salt, key });
    this._emit('keys', { restored });
    return restored;
  }

  /** Delete the backup from the server and stop maintaining it on this device. */
  async disableBackup() {
    clearTimeout(this._backupTimer);
    await this.keyStore.set(this._backupSlot(), null);
    await this._req('DELETE', '/me/backup');
  }

  /** This person's registered devices; remove one that is lost or no longer used. */
  devices() {
    return this._req('GET', '/me/devices').then((r) => r.devices);
  }
  removeDevice(deviceId) {
    return this._req('DELETE', `/me/devices/${encodeURIComponent(deviceId)}`);
  }
  async _hydrate(message, conv) {
    const out = { ...message, text: message.body, file: message.attachment, encrypted: false, undecryptable: false };
    if (message.deleted || message.kind === 'system') return out;
    if (message.kind === 'call') {
      // Call markers are plain metadata in every conversation: { callId, video }.
      out.call = JSON.parse(message.body);
      out.text = '';
      return out;
    }
    conv ??= this._convs.get(message.conversationId) ?? (await this.conversation(message.conversationId));
    out.encrypted = conv.encrypted;
    // Unopened or already-consumed view-once messages arrive without content.
    if (!message.body) return out;
    try {
      let payload;
      if (conv.encrypted) {
        const k = await this._epochKey(conv, e2ee.epochOf(message.body));
        if (!k) throw new Error('no key for this epoch on this device');
        payload = JSON.parse(await e2ee.decryptText(k.key, message.body, conv.id));
        out.text = payload.t ?? '';
        out.file = message.attachment && { ...message.attachment, name: payload.f?.name ?? 'file', mime: payload.f?.mime ?? 'application/octet-stream' };
      } else if (message.kind !== 'text') {
        const v = JSON.parse(message.body);
        payload = message.kind === 'poll' ? { poll: v } : message.kind === 'custom' ? { custom: v } : { loc: v };
      }
      if (message.kind === 'custom') {
        out.custom = { type: payload.custom.type, data: payload.custom.data };
        out.text = payload.custom.text ?? '';
      }
      if (message.kind === 'poll') {
        out.text = payload.poll.question;
        out.poll = { ...message.poll, question: payload.poll.question, options: payload.poll.options };
      } else if (message.kind === 'location') {
        out.location = payload.loc;
        out.text = payload.loc.label ?? '';
      }
    } catch {
      out.text = '';
      out.undecryptable = true;
    }
    return out;
  }

  async _hydrateConversation(conv) {
    this._convs.set(conv.id, conv);
    if (conv.lastMessage) conv.lastMessage = await this._hydrate(conv.lastMessage, conv);
    this._shareKeys(conv).catch(() => {});
    return conv;
  }

  async _conv(id) {
    return this._convs.get(id) ?? this.conversation(id);
  }

  // ---- users ----

  searchUsers(q = '') {
    return this._req('GET', `/users?q=${encodeURIComponent(q)}`).then((r) => r.users);
  }
  user(id) {
    return this._req('GET', `/users/${encodeURIComponent(id)}`);
  }
  /** Exact lookup by email, phone, username or any custom handle kind the host uses. */
  findUser(handle, kind) {
    const p = new URLSearchParams({ handle });
    if (kind) p.set('kind', kind);
    return this._req('GET', `/users/lookup?${p}`);
  }
  async openDmByHandle(handle, options) {
    return this.openDm((await this.findUser(handle)).id, options);
  }
  block(userId) {
    return this._req('PUT', `/blocks/${encodeURIComponent(userId)}`);
  }
  unblock(userId) {
    return this._req('DELETE', `/blocks/${encodeURIComponent(userId)}`);
  }
  blocked() {
    return this._req('GET', '/blocks').then((r) => r.blocked);
  }

  // ---- conversations ----

  async conversations() {
    const { conversations } = await this._req('GET', '/conversations');
    return Promise.all(conversations.map((c) => this._hydrateConversation(c)));
  }

  async conversation(id) {
    return this._hydrateConversation(await this._req('GET', `/conversations/${id}`));
  }

  async _create(spec, memberIds, encrypted) {
    const json = { ...spec, memberIds };
    let fresh;
    if (encrypted) {
      json.id = crypto.randomUUID();
      json.encrypted = true;
      fresh = await e2ee.newConversationKey();
      json.keys = await this._wrapForDevices(json.id, [{ epoch: 1, raw: fresh.raw }], await this._devicesOf([this.me.id, ...memberIds]));
    }
    const conv = await this._req('POST', '/conversations', { json });
    // An existing DM is returned as-is, in which case our new key was not used.
    if (fresh && conv.id === json.id) this._keys.set(`${conv.id}:1`, Promise.resolve({ epoch: 1, ...fresh })), this._backupSoon();
    return this._hydrateConversation(conv);
  }

  /** Open (or create) the one-to-one conversation with a user. */
  openDm(userId, { encrypted = false, ttlSeconds } = {}) {
    return this._create({ type: 'dm', ttlSeconds }, [userId], encrypted);
  }

  createGroup({ title, memberIds, encrypted = false, ttlSeconds }) {
    return this._create({ type: 'group', title, ttlSeconds }, memberIds, encrypted);
  }

  async update(conversationId, patch) {
    return this._hydrateConversation(await this._req('PATCH', `/conversations/${conversationId}`, { json: patch }));
  }

  /** Private per-user preferences: `{ muted, archived, pinned }`. */
  async settings(conversationId, prefs) {
    return this._hydrateConversation(await this._req('PUT', `/conversations/${conversationId}/settings`, { json: prefs }));
  }

  async addMembers(conversationId, userIds) {
    const conv = await this._conv(conversationId);
    const json = { userIds };
    // Newcomers get every key this device holds, so they can read the history too.
    if (conv.encrypted) json.keys = await this._wrapForDevices(conv.id, await this._heldKeys(conv), await this._devicesOf(userIds));
    return this._hydrateConversation(await this._req('POST', `/conversations/${conversationId}/members`, { json }));
  }

  /** Create a code people can use to join a (non-encrypted) group themselves. */
  createInvite(conversationId, { ttlSeconds, maxUses } = {}) {
    return this._req('POST', `/conversations/${conversationId}/invites`, { json: { ttlSeconds, maxUses } });
  }
  invites(conversationId) {
    return this._req('GET', `/conversations/${conversationId}/invites`).then((r) => r.invites);
  }
  revokeInvite(conversationId, code) {
    return this._req('DELETE', `/conversations/${conversationId}/invites/${encodeURIComponent(code)}`);
  }
  /** What an invite leads to, before joining. */
  invite(code) {
    return this._req('GET', `/invites/${encodeURIComponent(code)}`);
  }
  async joinByInvite(code) {
    return this._hydrateConversation(await this._req('POST', `/invites/${encodeURIComponent(code)}/join`));
  }

  /** Everything the server holds about the signed-in user. */
  exportMyData() {
    return this._req('GET', '/me/export');
  }

  removeMember(conversationId, userId) {
    return this._req('DELETE', `/conversations/${conversationId}/members/${encodeURIComponent(userId)}`);
  }

  leave(conversationId) {
    return this.removeMember(conversationId, this.me.id);
  }

  /** Short code members compare in person to rule out key tampering. */
  async safetyCode(conversationId) {
    const conv = await this.conversation(conversationId);
    return e2ee.safetyCode(conv.members.flatMap((m) => m.devices.map((d) => `${m.userId}:${d.publicKey}`)));
  }

  // ---- messages ----

  /**
   * A page of history, oldest first. With no range: the latest messages.
   * `before` / `after` page backwards and forwards from a message's `seq`;
   * `around` returns the messages either side of one.
   */
  async messages(conversationId, { before, after, around, limit = 50 } = {}) {
    const conv = await this._conv(conversationId);
    const q = new URLSearchParams({ limit });
    for (const [k, v] of Object.entries({ before, after, around })) if (v !== undefined) q.set(k, v);
    const { messages } = await this._req('GET', `/conversations/${conversationId}/messages?${q}`);
    return Promise.all(messages.map((m) => this._hydrate(m, conv)));
  }

  /**
   * @param {string} conversationId
   * @param {object} content
   * @param {string} [content.text]
   * @param {File|Blob} [content.file]
   * @param {string} [content.replyTo]     id of the message being answered
   * @param {string[]} [content.mentions]  user ids to notify even if they muted the chat
   * @param {boolean} [content.viewOnce]   each recipient can open it a single time, then it is wiped
   */
  async send(conversationId, { text = '', file, replyTo, mentions, viewOnce, forwarded } = {}) {
    const conv = await this._conv(conversationId);
    const k = conv.encrypted ? await this._requireKey(conv) : null;
    let attachment, fileMeta;
    if (file) {
      fileMeta = { name: file.name ?? 'file', mime: file.type || 'application/octet-stream' };
      let bytes = await file.arrayBuffer();
      // In encrypted conversations the server sees neither content, name nor type.
      if (k) bytes = await e2ee.encryptBytes(k.key, bytes, conv.id);
      const up = await this._req('POST', `/conversations/${conversationId}/files`, {
        body: bytes,
        headers: {
          'content-type': k ? 'application/octet-stream' : fileMeta.mime,
          'x-filename': encodeURIComponent(k ? 'encrypted' : fileMeta.name),
        },
      });
      attachment = { fileId: up.fileId };
    }
    return this._post(conv, k, 'text', { t: text, f: fileMeta }, text, { replyTo, attachment, mentions, viewOnce, forwarded });
  }

  // Encrypted conversations carry one JSON payload as ciphertext; plain ones
  // carry the readable body the REST API documents.
  async _post(conv, k, kind, payload, plainBody, extra = {}) {
    const clientId = crypto.randomUUID();
    const post = async (key) => this._req('POST', `/conversations/${conv.id}/messages`, {
      json: { kind, body: key ? await e2ee.encryptText(key.key, JSON.stringify(payload), conv.id, key.epoch) : plainBody, clientId, ...extra },
    });
    let message;
    try {
      message = await post(k);
    } catch (e) {
      // The key changed under us (someone left, or another device rotated). An
      // attachment was encrypted with the old key, so only plain sends can retry.
      if (!k || (e.code !== 'rotation_required' && e.code !== 'stale_epoch') || extra.attachment) throw e;
      message = await post(await this._requireKey(await this.conversation(conv.id)));
    }
    const out = await this._hydrate(message, conv);
    // The sender never gets a view-once body back, so keep what we just wrote.
    if (message.viewOnce) out.text = payload.t ?? '';
    return out;
  }

  async sendPoll(conversationId, { question, options, multi = false }) {
    const conv = await this._conv(conversationId);
    const k = conv.encrypted ? await this._requireKey(conv) : null;
    const poll = { question, options };
    return this._post(conv, k, 'poll', { poll }, JSON.stringify(poll), { poll: { options: options.length, multi } });
  }

  async sendLocation(conversationId, { lat, lng, label }) {
    const conv = await this._conv(conversationId);
    const k = conv.encrypted ? await this._requireKey(conv) : null;
    const loc = { lat, lng, label };
    return this._post(conv, k, 'location', { loc }, JSON.stringify(loc));
  }

  /**
   * A message type of the host's own: a payment receipt, an order card, an
   * appointment... `text` is what clients without a renderer for `type` show.
   */
  async sendCustom(conversationId, { type, data, text = '' }) {
    const conv = await this._conv(conversationId);
    const k = conv.encrypted ? await this._requireKey(conv) : null;
    const custom = { type, data, text };
    return this._post(conv, k, 'custom', { custom }, JSON.stringify(custom));
  }

  /**
   * Start a call through the host's own call vendor. Resolves with
   * `{ call, message, join }`, where `join` is whatever the host's `call.join`
   * hook returned for this user: a `url` to open and/or vendor `data` (tokens).
   */
  async startCall(conversationId, { video = false } = {}) {
    const out = await this._req('POST', `/conversations/${conversationId}/calls`, { json: { video } });
    return { ...out, message: await this._hydrate(out.message) };
  }

  joinCall(callId) {
    return this._req('POST', `/calls/${callId}/join`);
  }

  /** Copy a message into another conversation (re-encrypting for it if needed). */
  async forward(message, toConversationId) {
    if (message.kind === 'custom') return this.sendCustom(toConversationId, { ...message.custom, text: message.text });
    if (message.kind === 'poll') return this.sendPoll(toConversationId, { question: message.poll.question, options: message.poll.options, multi: message.poll.multi });
    if (message.kind === 'location') return this.sendLocation(toConversationId, message.location);
    let file;
    if (message.file) file = new File([await this.download(message)], message.file.name, { type: message.file.mime });
    return this.send(toConversationId, { text: message.text, file, forwarded: true });
  }

  /**
   * Send a text message later. `sendAt` is a Date or a millisecond timestamp.
   * It goes out as you, through the platform's usual checks at that moment.
   */
  async schedule(conversationId, { text, replyTo, mentions }, sendAt) {
    const conv = await this._conv(conversationId);
    const k = conv.encrypted ? await this._requireKey(conv) : null;
    const body = k ? await e2ee.encryptText(k.key, JSON.stringify({ t: text }), conv.id, k.epoch) : text;
    const out = await this._req('POST', `/conversations/${conversationId}/scheduled`, {
      json: { sendAt: sendAt instanceof Date ? sendAt.getTime() : sendAt, message: { kind: 'text', body, replyTo, mentions } },
    });
    return { ...out, text };
  }

  /** Your messages waiting to be sent, soonest first; `error` is set on any that could not be sent. */
  async scheduled() {
    const { scheduled } = await this._req('GET', '/scheduled');
    return Promise.all(scheduled.map(async (s) => {
      const shown = await this._hydrate({ conversationId: s.conversationId, kind: s.message.kind ?? 'text', body: s.message.body, attachment: null }).catch(() => ({ text: '' }));
      return { ...s, text: shown.text };
    }));
  }

  cancelScheduled(id) {
    return this._req('DELETE', `/scheduled/${id}`);
  }

  /** The messages in a conversation that carry a photo or file, newest first. */
  async attachments(conversationId) {
    const conv = await this._conv(conversationId);
    const { messages } = await this._req('GET', `/conversations/${conversationId}/attachments`);
    return Promise.all(messages.map((m) => this._hydrate(m, conv)));
  }

  /** One message by id (you must be in its conversation). */
  async message(messageId) {
    return this._hydrate(await this._req('GET', `/messages/${messageId}`));
  }

  /** Bookmark a message privately. */
  star(messageId) {
    return this._req('PUT', `/messages/${messageId}/star`);
  }
  unstar(messageId) {
    return this._req('DELETE', `/messages/${messageId}/star`);
  }
  async starred() {
    const { messages } = await this._req('GET', '/starred');
    return Promise.all(messages.map((m) => this._hydrate(m)));
  }

  /** What others may see about you: `{ readReceipts, presence }`. */
  async setPrivacy(settings) {
    const { privacy } = await this._req('PUT', '/me/settings', { json: settings });
    this.me.privacy = privacy;
    return privacy;
  }

  /** Group owner only: make someone 'admin', 'member', or hand over as 'owner'. */
  async setRole(conversationId, userId, role) {
    return this._hydrateConversation(await this._req('PATCH', `/conversations/${conversationId}/members/${encodeURIComponent(userId)}`, { json: { role } }));
  }

  async vote(messageId, options) {
    return this._hydrate(await this._req('PUT', `/messages/${messageId}/vote`, { json: { options } }));
  }

  async pin(messageId) {
    return this._hydrate(await this._req('PUT', `/messages/${messageId}/pin`));
  }
  async unpin(messageId) {
    return this._hydrate(await this._req('DELETE', `/messages/${messageId}/pin`));
  }
  async pins(conversationId) {
    const conv = await this._conv(conversationId);
    const { messages } = await this._req('GET', `/conversations/${conversationId}/pins`);
    return Promise.all(messages.map((m) => this._hydrate(m, conv)));
  }

  /** Open a view-once message. Resolves with its content exactly once; a second call rejects with 410. */
  async open(messageId) {
    return this._hydrate(await this._req('POST', `/messages/${messageId}/open`));
  }

  report(messageId, reason) {
    return this._req('POST', `/messages/${messageId}/report`, { json: { reason } });
  }

  /** Server-side search. Encrypted conversations are not searchable by the server. */
  async search(q, { conversationId } = {}) {
    const p = new URLSearchParams({ q });
    if (conversationId) p.set('conversationId', conversationId);
    const { messages } = await this._req('GET', `/search?${p}`);
    return Promise.all(messages.map((m) => this._hydrate(m)));
  }

  // ---- stories ----

  stories() {
    return this._req('GET', '/stories').then((r) => r.feed);
  }

  async postStory({ text = '', file, ttlSeconds } = {}) {
    let attachment;
    if (file) {
      const up = await this._req('POST', '/files', {
        body: await file.arrayBuffer(),
        headers: { 'content-type': file.type || 'application/octet-stream', 'x-filename': encodeURIComponent(file.name ?? 'file') },
      });
      attachment = { fileId: up.fileId };
    }
    return this._req('POST', '/stories', { json: { text, attachment, ttlSeconds } });
  }

  viewStory(storyId) {
    return this._req('POST', `/stories/${storyId}/view`);
  }

  deleteStory(storyId) {
    return this._req('DELETE', `/stories/${storyId}`);
  }

  async storyFile(story) {
    return new Blob([await this._req('GET', `/files/${story.attachment.fileId}`, { blob: true })], { type: story.attachment.mime });
  }

  // ---- calls (WebRTC; media is peer-to-peer and encrypted in transit by DTLS-SRTP) ----

  iceServers() {
    return this._req('GET', '/ice').then((r) => r.iceServers);
  }

  /** Low-level call signalling. `client/calls.js` builds on this. */
  signal(conversationId, to, data) {
    if (this._ws?.readyState !== 1) throw new PlugChatError(0, 'offline', 'Not connected');
    this._ws.send(JSON.stringify({ type: 'signal', conversationId, to, data }));
  }

  /** @param {object} message A message previously returned by this client. */
  async edit(message, text) {
    const conv = await this._conv(message.conversationId);
    let body = text;
    if (conv.encrypted) {
      // An edit keeps the message's original key, which its attachment was encrypted with.
      const k = await this._epochKey(conv, e2ee.epochOf(message.body));
      if (!k) throw new PlugChatError(0, 'no_key', 'This device does not hold the key this message was written with');
      const f = message.file ? { name: message.file.name, mime: message.file.mime } : undefined;
      body = await e2ee.encryptText(k.key, JSON.stringify({ t: text, f }), conv.id, k.epoch);
    }
    return this._hydrate(await this._req('PATCH', `/messages/${message.id}`, { json: { body } }), conv);
  }

  remove(messageId) {
    return this._req('DELETE', `/messages/${messageId}`);
  }

  react(messageId, emoji) {
    return this._req('PUT', `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
  }

  unreact(messageId, emoji) {
    return this._req('DELETE', `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
  }

  read(conversationId, seq) {
    return this._req('POST', `/conversations/${conversationId}/read`, { json: { seq } });
  }

  typing(conversationId) {
    if (this._ws?.readyState === 1) this._ws.send(JSON.stringify({ type: 'typing', conversationId }));
  }

  /** Download (and, if needed, decrypt) a message's attachment. */
  async download(message) {
    let bytes = await this._req('GET', `/files/${message.file.fileId}`, { blob: true });
    if (message.encrypted) {
      const conv = await this._conv(message.conversationId);
      const k = await this._epochKey(conv, e2ee.epochOf(message.body));
      if (!k) throw new PlugChatError(0, 'no_key', 'This device does not hold the key for this attachment');
      bytes = await e2ee.decryptBytes(k.key, bytes, conv.id);
    }
    return new Blob([bytes], { type: message.file.mime });
  }
}
