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
    this._keys = new Map(); // conversationId -> Promise<{ raw, key } | null>
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
      if (this.me.publicKey !== this.identity.publicKey) {
        this.me = await this._req('PUT', '/me/key', { json: { publicKey: this.identity.publicKey } });
      }
    }
    await this._openSocket();
    return this.me;
  }

  close() {
    this._closed = true;
    clearTimeout(this._refreshTimer);
    clearTimeout(this._retryTimer);
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
        this._keys.delete(event.conversationId);
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

  _conversationKey(conv) {
    if (!conv.encrypted) return Promise.resolve(null);
    let p = this._keys.get(conv.id);
    if (!p) {
      p = (async () => {
        if (!this.identity || !conv.wrappedKey) return null;
        try {
          return await e2ee.unwrapKey(this.identity, conv.wrappedKey, conv.id);
        } catch {
          return null; // wrapped for a different device
        }
      })();
      this._keys.set(conv.id, p);
    }
    return p;
  }

  async _requireKey(conv) {
    const k = await this._conversationKey(conv);
    if (!k) throw new PlugChatError(0, 'no_key', 'This device does not hold the key for this encrypted conversation');
    return k;
  }

  async _wrapFor(conversationId, raw, userIds) {
    if (!this.identity) throw new PlugChatError(0, 'e2ee_disabled', 'End-to-end encryption is not enabled on this client');
    const keys = {};
    for (const id of userIds) {
      const { publicKey } = id === this.me.id ? this.identity : await this._req('GET', `/users/${encodeURIComponent(id)}/key`);
      if (!publicKey) {
        const name = await this.user(id).then((u) => u.name, () => 'This person');
        throw new PlugChatError(409, 'no_public_key', `${name} has not opened chat yet, so encryption cannot be set up with them`);
      }
      keys[id] = await e2ee.wrapKey(this.identity, this.me.id, publicKey, conversationId, raw);
    }
    return keys;
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
        const { key } = await this._requireKey(conv);
        payload = JSON.parse(await e2ee.decryptText(key, message.body, conv.id));
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
      json.keys = await this._wrapFor(json.id, fresh.raw, [this.me.id, ...memberIds]);
    }
    const conv = await this._req('POST', '/conversations', { json });
    // An existing DM is returned as-is, in which case our new key was not used.
    if (fresh && conv.id === json.id) this._keys.set(conv.id, Promise.resolve(fresh));
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
    if (conv.encrypted) json.keys = await this._wrapFor(conv.id, (await this._requireKey(conv)).raw, userIds);
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
    return e2ee.safetyCode(conv.members.map((m) => `${m.userId}:${m.publicKey}`));
  }

  // ---- messages ----

  async messages(conversationId, { before, limit = 50 } = {}) {
    const conv = await this._conv(conversationId);
    const q = new URLSearchParams({ limit });
    if (before) q.set('before', before);
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
    const body = k ? await e2ee.encryptText(k.key, JSON.stringify(payload), conv.id) : plainBody;
    const message = await this._req('POST', `/conversations/${conv.id}/messages`, {
      json: { kind, body, clientId: crypto.randomUUID(), ...extra },
    });
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
      const { key } = await this._requireKey(conv);
      const f = message.file ? { name: message.file.name, mime: message.file.mime } : undefined;
      body = await e2ee.encryptText(key, JSON.stringify({ t: text, f }), conv.id);
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
      bytes = await e2ee.decryptBytes((await this._requireKey(conv)).key, bytes, conv.id);
    }
    return new Blob([bytes], { type: message.file.mime });
  }
}
