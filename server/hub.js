import { WebSocketServer } from 'ws';

const AUTH_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 30_000;

/**
 * Realtime fan-out. Sockets only receive events; every change goes through
 * the REST API so that hosts in any language need just one code path.
 * The single exception is the typing indicator, which is too chatty for HTTP.
 */
export class Hub {
  constructor({ store, authenticate, allowOrigin, bus }) {
    this.store = store;
    // With several PlugChat instances, the bus carries events to sockets held by the others.
    this.bus = bus;
    bus?.subscribe((msg) => {
      if (msg.disconnect) this._disconnectLocal(msg.disconnect);
      else this._deliver(msg.userIds, msg.event);
    });
    this.authenticate = authenticate;
    this.allowOrigin = allowOrigin;
    this.sockets = new Map(); // userId -> Set<WebSocket>
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
    this.wss.on('connection', (ws) => this._onConnection(ws));
    this.heartbeat = setInterval(() => this._beat(), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  upgrade(req, socket, head) {
    if (!this.allowOrigin(req.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws));
  }

  isOnline(userId) {
    return this.sockets.has(userId) || !!this.bus?.isOnline?.(userId);
  }

  emit(userIds, event) {
    const ids = [...new Set(userIds)];
    this._deliver(ids, event);
    if (ids.length) this.bus?.publish({ userIds: ids, event });
  }

  _deliver(userIds, event) {
    const data = JSON.stringify(event);
    for (const uid of userIds) {
      for (const ws of this.sockets.get(uid) ?? []) {
        if (ws.readyState === ws.OPEN) ws.send(data);
      }
    }
  }

  /** Drop every socket a user has, e.g. after the host erases or bans them. */
  disconnect(userId) {
    this._disconnectLocal(userId);
    this.bus?.publish({ disconnect: userId });
  }

  _disconnectLocal(userId) {
    for (const ws of this.sockets.get(userId) ?? []) ws.close(4403, 'removed');
  }

  close() {
    clearInterval(this.heartbeat);
    for (const ws of this.wss.clients) ws.terminate();
    this.wss.close();
  }

  _onConnection(ws) {
    ws.alive = true;
    ws.userId = null;
    ws.typingAt = 0;
    ws.signalWindow = 0;
    ws.signalCount = 0;
    // The token travels in the first frame, not the URL, so it never lands in access logs.
    ws.authTimer = setTimeout(() => ws.close(4401, 'auth timeout'), AUTH_TIMEOUT_MS);

    ws.on('pong', () => (ws.alive = true));
    ws.on('error', () => {});
    ws.on('close', () => this._onClose(ws));
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return ws.close(4400, 'bad json');
      }
      if (msg?.type === 'auth') return this._auth(ws, msg.token);
      if (!ws.userId) return ws.close(4401, 'not authenticated');
      if (msg?.type === 'typing') return this._typing(ws, msg.conversationId);
      if (msg?.type === 'signal') return this._signal(ws, msg);
    });
  }

  // Call setup (WebRTC offers, answers, ICE candidates). Media itself flows
  // peer-to-peer; the server only passes these envelopes between two members
  // of the same conversation.
  _signal(ws, { conversationId, to, data }) {
    const t = Date.now();
    if (t - ws.signalWindow > 1000) (ws.signalWindow = t), (ws.signalCount = 0);
    if (++ws.signalCount > 60) return;
    if (typeof conversationId !== 'string' || typeof to !== 'string' || !data || typeof data !== 'object') return;
    if (!this.store.member(conversationId, ws.userId) || !this.store.member(conversationId, to)) return;
    if (this.store.isBlocked(ws.userId, to)) return;
    this.emit([to], { type: 'signal', conversationId, from: ws.userId, data });
  }

  _auth(ws, token) {
    let claims;
    try {
      claims = this.authenticate(token);
    } catch {
      return ws.close(4401, 'invalid token');
    }
    if (ws.userId && ws.userId !== claims.sub) return ws.close(4401, 'identity changed');

    clearTimeout(ws.authTimer);
    clearTimeout(ws.expiryTimer);
    // A socket lives only as long as the token that opened it; the client
    // re-sends `auth` with a fresh token to stay connected.
    const msLeft = Math.min(claims.exp * 1000 - Date.now(), 2 ** 31 - 1);
    ws.expiryTimer = setTimeout(() => ws.close(4401, 'token expired'), msLeft);

    const first = !ws.userId;
    ws.userId = claims.sub;
    if (first) {
      const wasOnline = this.isOnline(ws.userId);
      let set = this.sockets.get(ws.userId);
      if (!set) this.sockets.set(ws.userId, (set = new Set()));
      set.add(ws);
      this.bus?.setPresence?.(ws.userId, true);
      const peers = this.store.peers(ws.userId);
      if (!wasOnline) this.emit(peers, { type: 'presence', userId: ws.userId, online: true });
      ws.send(JSON.stringify({ type: 'ready', userId: ws.userId, online: peers.filter((p) => this.isOnline(p)) }));
    }
  }

  _typing(ws, conversationId) {
    const t = Date.now();
    if (typeof conversationId !== 'string' || t - ws.typingAt < 1000) return;
    ws.typingAt = t;
    if (!this.store.member(conversationId, ws.userId)) return;
    const others = this.store.memberIds(conversationId).filter((id) => id !== ws.userId);
    this.emit(others, { type: 'typing', conversationId, userId: ws.userId });
  }

  _onClose(ws) {
    clearTimeout(ws.authTimer);
    clearTimeout(ws.expiryTimer);
    if (!ws.userId) return;
    const set = this.sockets.get(ws.userId);
    set?.delete(ws);
    if (set && set.size === 0) {
      this.sockets.delete(ws.userId);
      try {
        this.bus?.setPresence?.(ws.userId, false);
        this.store.touchUser(ws.userId);
        // Still connected through another instance: not offline yet.
        if (this.isOnline(ws.userId)) return;
        this.emit(this.store.peers(ws.userId), { type: 'presence', userId: ws.userId, online: false, lastSeen: Date.now() });
      } catch {
        // store already closed during shutdown
      }
    }
  }

  _beat() {
    for (const ws of this.wss.clients) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
  }
}
