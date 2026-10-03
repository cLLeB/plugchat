// One-to-one voice and video calls over WebRTC.
//
// Audio and video travel directly between the two devices (or through the
// host's own TURN relay) and are encrypted in transit by WebRTC itself. The
// PlugChat server only relays the small setup messages below.
//
//   invite -> (ringing) -> accept -> offer -> answer -> ice... -> end

const RING_TIMEOUT_MS = 45_000;

class Emitter {
  constructor() {
    this._l = new Map();
  }
  on(type, fn) {
    if (!this._l.has(type)) this._l.set(type, new Set());
    this._l.get(type).add(fn);
    return () => this._l.get(type).delete(fn);
  }
  _emit(type, payload) {
    for (const fn of this._l.get(type) ?? []) fn(payload);
  }
}

export class Call extends Emitter {
  constructor(manager, { id, conversationId, peerId, video, direction }) {
    super();
    this.manager = manager;
    this.id = id;
    this.conversationId = conversationId;
    this.peerId = peerId;
    this.video = video;
    this.direction = direction;
    this.state = 'ringing'; // ringing -> connecting -> active -> ended
    this.reason = null;
    this.localStream = null;
    this.remoteStream = null;
    this.startedAt = null;
    this._pc = null;
    this._pendingIce = [];
    this._ringTimer = setTimeout(() => this._end('no answer', true), RING_TIMEOUT_MS);
  }

  _send(data, to = this.peerId) {
    try {
      this.manager.chat.signal(this.conversationId, to, { call: this.id, ...data });
    } catch {
      // offline: the other side will time out
    }
  }

  _setState(state) {
    this.state = state;
    this._emit('state', state);
  }

  async _media() {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: this.video });
    this._emit('local', this.localStream);
  }

  async _peer() {
    const pc = (this._pc = new RTCPeerConnection({ iceServers: await this.manager.iceServers() }));
    for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    pc.onicecandidate = (e) => e.candidate && this._send({ t: 'ice', candidate: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      this.remoteStream = e.streams[0];
      this._emit('remote', this.remoteStream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' && this.state !== 'active') {
        this.startedAt = Date.now();
        this._setState('active');
      } else if (pc.connectionState === 'failed') {
        this._end('connection lost', true);
      }
    };
    return pc;
  }

  /** Answer an incoming call. */
  async accept() {
    if (this.direction !== 'in' || this.state !== 'ringing') return;
    clearTimeout(this._ringTimer);
    try {
      await this._media();
    } catch {
      return this._end('microphone or camera unavailable', true);
    }
    this._setState('connecting');
    this._send({ t: 'accept' });
    // Stop this user's other devices from ringing.
    this._send({ t: 'end', reason: 'answered on another device' }, this.manager.chat.me.id);
  }

  decline() {
    this._end('declined', true);
  }

  hangup() {
    this._end('ended', true);
  }

  setMuted(muted) {
    for (const t of this.localStream?.getAudioTracks() ?? []) t.enabled = !muted;
  }

  setCamera(on) {
    for (const t of this.localStream?.getVideoTracks() ?? []) t.enabled = on;
  }

  async _onSignal(from, data) {
    const mine = from === this.manager.chat.me.id;
    if (mine) {
      // Only meaningful while this device is still ringing for a call another device took.
      if (data.t === 'end' && this.direction === 'in' && this.state === 'ringing') this._end(data.reason, false);
      return;
    }
    if (from !== this.peerId) return;
    switch (data.t) {
      case 'accept': {
        if (this.direction !== 'out' || this.state !== 'ringing') return;
        clearTimeout(this._ringTimer);
        this._setState('connecting');
        const pc = await this._peer();
        await pc.setLocalDescription(await pc.createOffer());
        return this._send({ t: 'offer', sdp: pc.localDescription.sdp });
      }
      case 'offer': {
        if (this.direction !== 'in' || this.state !== 'connecting' || this._pc) return;
        const pc = await this._peer();
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        await this._flushIce();
        await pc.setLocalDescription(await pc.createAnswer());
        return this._send({ t: 'answer', sdp: pc.localDescription.sdp });
      }
      case 'answer':
        if (!this._pc || this._pc.signalingState !== 'have-local-offer') return;
        await this._pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        return this._flushIce();
      case 'ice':
        if (this._pc?.remoteDescription) return this._pc.addIceCandidate(data.candidate).catch(() => {});
        return void this._pendingIce.push(data.candidate);
      case 'end':
        return this._end(data.reason ?? 'ended', false);
    }
  }

  async _flushIce() {
    for (const c of this._pendingIce.splice(0)) await this._pc.addIceCandidate(c).catch(() => {});
  }

  _end(reason, tellPeer) {
    if (this.state === 'ended') return;
    clearTimeout(this._ringTimer);
    if (tellPeer) this._send({ t: 'end', reason });
    this._pc?.close();
    for (const t of this.localStream?.getTracks() ?? []) t.stop();
    this.reason = reason;
    this._setState('ended');
    this.manager._ended(this);
  }
}

export class CallManager extends Emitter {
  /** @param {import('./plugchat.js').PlugChat} chat */
  constructor(chat) {
    super();
    this.chat = chat;
    this.current = null;
    this._ice = null;
    this._off = chat.on('signal', (e) => this._onSignal(e));
  }

  static get supported() {
    return typeof RTCPeerConnection !== 'undefined' && !!globalThis.navigator?.mediaDevices?.getUserMedia;
  }

  iceServers() {
    return (this._ice ??= this.chat.iceServers().catch(() => []));
  }

  /** Ring the other member of a direct conversation. */
  async start(conversationId, peerId, { video = false } = {}) {
    if (this.current) throw new Error('Already in a call');
    const call = (this.current = new Call(this, { id: crypto.randomUUID(), conversationId, peerId, video, direction: 'out' }));
    try {
      await call._media();
    } catch {
      call._end('microphone or camera unavailable', false);
      throw new Error('Microphone or camera permission was denied');
    }
    if (call.state !== 'ended') call._send({ t: 'invite', video });
    return call;
  }

  _onSignal({ conversationId, from, data }) {
    if (!data || typeof data.call !== 'string') return;
    if (this.current?.id === data.call) return this.current._onSignal(from, data).catch((e) => console.error('plugchat call failed', e));
    if (data.t !== 'invite' || from === this.chat.me.id) return;
    if (this.current) {
      // Busy: tell the caller without disturbing the call in progress.
      return this.chat.signal(conversationId, from, { call: data.call, t: 'end', reason: 'busy' });
    }
    this.current = new Call(this, { id: data.call, conversationId, peerId: from, video: !!data.video, direction: 'in' });
    this._emit('incoming', this.current);
  }

  _ended(call) {
    if (this.current === call) this.current = null;
    this._emit('ended', call);
  }

  close() {
    this._off();
    this.current?.hangup();
  }
}
