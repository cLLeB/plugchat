// <plug-chat> — the drop-in chat UI. A standard custom element, so it works
// the same in React, Vue, Angular, Svelte, server-rendered pages and WebViews.
//
//   <script type="module" src="https://your-host/plugchat/client/element.js"></script>
//   <plug-chat server="https://your-host/plugchat" token-url="/api/chat-token"></plug-chat>
//
// All user-provided text is inserted with textContent, never as HTML.
import { PlugChat } from './plugchat.js';

const ICON = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-3-7-7-1z"/></svg>',
  clip: '<svg viewBox="0 0 24 24"><path d="M20 11l-8.5 8.5a5 5 0 01-7-7L13 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L14 7"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  reply: '<svg viewBox="0 0 24 24"><path d="M10 8L5 12l5 4M5 12h9a5 5 0 015 5v1"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
  smile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 007 0M9 9.5v.5M15 9.5v.5"/></svg>',
  timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const INLINE_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const TIMERS = [[0, 'Off'], [60, '1 minute'], [3600, '1 hour'], [86400, '1 day'], [604800, '1 week']];

const CSS = `
:host {
  --pc-accent: #3b5bdb; --pc-accent-fg: #fff;
  --pc-bg: #fff; --pc-surface: #f5f6f8; --pc-fg: #16181d; --pc-muted: #6b7280;
  --pc-border: #e3e5ea; --pc-bubble: #eceef2; --pc-danger: #c92a2a; --pc-radius: 14px;
  display: block; height: 600px; container-type: inline-size;
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--pc-fg);
}
:host([theme="dark"]) {
  --pc-accent: #748ffc; --pc-accent-fg: #0b0d12; --pc-bg: #14161b; --pc-surface: #1b1e25; --pc-fg: #e8eaee;
  --pc-muted: #9199a6; --pc-border: #2a2e37; --pc-bubble: #262a33; --pc-danger: #ff8787;
}
@media (prefers-color-scheme: dark) {
  :host(:not([theme="light"])) {
    --pc-accent: #748ffc; --pc-accent-fg: #0b0d12; --pc-bg: #14161b; --pc-surface: #1b1e25; --pc-fg: #e8eaee;
    --pc-muted: #9199a6; --pc-border: #2a2e37; --pc-bubble: #262a33; --pc-danger: #ff8787;
  }
}
* { box-sizing: border-box; }
.root { display: flex; height: 100%; background: var(--pc-bg); border: 1px solid var(--pc-border); border-radius: var(--pc-radius); overflow: hidden; }
svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 2px; }
.icon { display: inline-grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; color: var(--pc-muted); flex: none; }
.icon:hover { background: var(--pc-surface); color: var(--pc-fg); }

.side { width: 300px; flex: none; display: flex; flex-direction: column; border-right: 1px solid var(--pc-border); min-width: 0; }
.bar { display: flex; align-items: center; gap: 10px; padding: 10px 12px; min-height: 58px; border-bottom: 1px solid var(--pc-border); }
.bar h2 { margin: 0; font-size: 17px; flex: 1; }
.list { overflow-y: auto; flex: 1; padding: 6px; }
.conv { display: flex; gap: 10px; align-items: center; width: 100%; text-align: left; padding: 9px 8px; border-radius: 10px; }
.conv:hover { background: var(--pc-surface); }
.conv[aria-current="true"] { background: color-mix(in srgb, var(--pc-accent) 14%, transparent); }
.conv .body { flex: 1; min-width: 0; }
.line { display: flex; gap: 6px; align-items: baseline; }
.name { font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.when { font-size: 12px; color: var(--pc-muted); flex: none; }
.preview { color: var(--pc-muted); font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { background: var(--pc-accent); color: var(--pc-accent-fg); border-radius: 10px; font-size: 11px; font-weight: 700; padding: 1px 7px; flex: none; }
.avatar { width: 40px; height: 40px; border-radius: 50%; flex: none; display: grid; place-items: center; font-weight: 600; color: #fff; position: relative; background-size: cover; background-position: center; font-size: 15px; }
.avatar.sm { width: 28px; height: 28px; font-size: 11px; }
.avatar .dot { position: absolute; right: -1px; bottom: -1px; width: 12px; height: 12px; border-radius: 50%; background: #2f9e44; border: 2px solid var(--pc-bg); }
.hint { color: var(--pc-muted); text-align: center; padding: 28px 16px; }

.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.main > .hint { margin: auto; }
.bar .title { flex: 1; min-width: 0; }
.bar .sub { font-size: 12px; color: var(--pc-muted); display: flex; align-items: center; gap: 4px; }
.bar .sub svg { width: 12px; height: 12px; }
.backbtn { display: none; }
.msgs { flex: 1; overflow-y: auto; padding: 14px 14px 6px; display: flex; flex-direction: column; gap: 2px; }
.day, .sys { align-self: center; font-size: 12px; color: var(--pc-muted); background: var(--pc-surface); padding: 3px 10px; border-radius: 10px; margin: 8px 0; }
.more { align-self: center; color: var(--pc-accent); font-size: 13px; padding: 6px 10px; }
.row { display: flex; gap: 8px; align-items: flex-end; max-width: 100%; position: relative; }
.row.first { margin-top: 8px; }
.row.mine { flex-direction: row-reverse; }
.row .spacer { width: 28px; flex: none; }
.col { display: flex; flex-direction: column; align-items: flex-start; max-width: min(78%, 520px); min-width: 0; }
.mine .col { align-items: flex-end; }
.bubble { background: var(--pc-bubble); padding: 7px 11px; border-radius: 16px; overflow-wrap: anywhere; white-space: pre-wrap; min-width: 0; max-width: 100%; }
.mine .bubble { background: var(--pc-accent); color: var(--pc-accent-fg); }
.bubble a { color: inherit; }
.bubble.ghost { background: none; border: 1px dashed var(--pc-border); color: var(--pc-muted); font-style: italic; }
.sender { font-size: 12px; font-weight: 600; color: var(--pc-accent); margin-bottom: 2px; }
.quote { font-size: 12px; opacity: .8; border-left: 3px solid currentColor; padding: 1px 8px; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
.meta { font-size: 11px; opacity: .7; margin-left: 8px; float: right; margin-top: 4px; display: inline-flex; gap: 4px; align-items: center; white-space: nowrap; }
.meta svg { width: 11px; height: 11px; }
.pic { display: block; max-width: 240px; max-height: 240px; border-radius: 10px; margin-bottom: 4px; }
.file { display: flex; gap: 8px; align-items: center; text-decoration: underline; margin-bottom: 2px; text-align: left; }
.reacts { display: flex; gap: 4px; flex-wrap: wrap; margin: 2px 0 4px; }
.react { border: 1px solid var(--pc-border); background: var(--pc-bg); border-radius: 12px; padding: 0 7px; font-size: 13px; line-height: 22px; }
.react.on { border-color: var(--pc-accent); background: color-mix(in srgb, var(--pc-accent) 14%, var(--pc-bg)); }
.acts { display: none; align-items: center; background: var(--pc-bg); border: 1px solid var(--pc-border); border-radius: 18px; padding: 2px; align-self: center; flex: none; }
.row:hover .acts, .row.active .acts, .row:focus-within .acts { display: flex; }
.acts .icon { width: 28px; height: 28px; }
.acts svg { width: 16px; height: 16px; }
.acts .emoji { font-size: 17px; width: 28px; height: 28px; border-radius: 50%; }
.acts .emoji:hover { background: var(--pc-surface); }
.acts .danger:hover { color: var(--pc-danger); }
.typing { min-height: 20px; padding: 0 16px; font-size: 12px; color: var(--pc-muted); }
.banner { display: flex; align-items: center; gap: 8px; padding: 6px 14px; border-top: 1px solid var(--pc-border); font-size: 13px; color: var(--pc-muted); }
.banner span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.banner .icon { width: 26px; height: 26px; }
.composer { display: flex; gap: 6px; align-items: flex-end; padding: 10px 12px; border-top: 1px solid var(--pc-border); }
textarea { flex: 1; resize: none; border: 1px solid var(--pc-border); border-radius: 18px; padding: 8px 14px; font: inherit; color: inherit; background: var(--pc-surface); max-height: 120px; min-height: 38px; }
.sendbtn { background: var(--pc-accent); color: var(--pc-accent-fg); }
.sendbtn:hover { background: var(--pc-accent); color: var(--pc-accent-fg); filter: brightness(1.1); }
.sendbtn:disabled { opacity: .45; cursor: default; }
.error { color: var(--pc-danger); font-size: 13px; padding: 4px 14px; }

dialog { border: 1px solid var(--pc-border); border-radius: var(--pc-radius); background: var(--pc-bg); color: var(--pc-fg); padding: 0; width: min(380px, calc(100% - 24px)); max-height: 85%; }
dialog::backdrop { background: rgba(0, 0, 0, .4); }
dialog form, dialog .panel { display: flex; flex-direction: column; gap: 10px; padding: 16px; }
dialog h3 { margin: 0; font-size: 16px; display: flex; align-items: center; }
dialog h3 span { flex: 1; }
dialog input[type="text"], dialog input[type="search"], select { font: inherit; color: inherit; background: var(--pc-surface); border: 1px solid var(--pc-border); border-radius: 10px; padding: 8px 12px; width: 100%; }
.people { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; }
.person { display: flex; gap: 10px; align-items: center; padding: 6px 4px; border-radius: 8px; cursor: pointer; }
.person:hover { background: var(--pc-surface); }
.person span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.person small { color: var(--pc-muted); }
.check { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
.check small { color: var(--pc-muted); display: block; }
.btn { background: var(--pc-accent); color: var(--pc-accent-fg); border-radius: 10px; padding: 9px 14px; font-weight: 600; }
.btn:disabled { opacity: .45; cursor: default; }
.btn.plain { background: var(--pc-surface); color: var(--pc-fg); }
.btn.warn { background: none; color: var(--pc-danger); border: 1px solid var(--pc-border); }
.code { font: 600 16px/1.6 ui-monospace, Consolas, monospace; letter-spacing: 1px; background: var(--pc-surface); padding: 10px; border-radius: 10px; text-align: center; }
label.field { font-size: 13px; color: var(--pc-muted); display: flex; flex-direction: column; gap: 4px; }

@container (max-width: 640px) {
  .side { width: 100%; border-right: 0; }
  .main { display: none; }
  .root.open .side { display: none; }
  .root.open .main { display: flex; }
  .backbtn { display: inline-grid; }
}
@media (prefers-reduced-motion: no-preference) { .msgs { scroll-behavior: smooth; } }
`;

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'icon') el.innerHTML = ICON[v]; // static markup only
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter((c) => c != null && c !== false));
  return el;
}

const hue = (s) => [...s].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 360, 7);
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0].toUpperCase()).join('') || '?';
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayLabel = (t) => {
  const d = new Date(t), today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === new Date(today - 864e5).toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};
const shortWhen = (t) => (new Date(t).toDateString() === new Date().toDateString() ? clock(t) : new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }));
const size = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function linkify(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    out.push(text.slice(last, m.index));
    out.push(h('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer nofollow' }, m[0]));
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

class PlugChatElement extends HTMLElement {
  static observedAttributes = ['server', 'token', 'token-url', 'peer'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.chat = null;
    this.convs = new Map();
    this.msgs = new Map(); // conversationId -> { list, more }
    this.activeId = null;
    this.typing = new Map(); // conversationId -> Map<userId, timer>
    this.blobs = new Map(); // fileId -> Promise<objectURL>
    this.replyTo = null;
    this.editing = null;
    this.pendingFile = null;
    this._getToken = null;
    this._started = false;
  }

  /** Alternative to the token/token-url attributes: `el.getToken = async () => '...'`. */
  set getToken(fn) {
    this._getToken = fn;
    this._maybeStart();
  }
  get getToken() {
    return this._getToken;
  }

  connectedCallback() {
    if (!this.shadowRoot.firstChild) this._build();
    this._onVisible = () => document.visibilityState === 'visible' && this._markRead();
    document.addEventListener('visibilitychange', this._onVisible);
    this._maybeStart();
  }

  disconnectedCallback() {
    document.removeEventListener('visibilitychange', this._onVisible);
    this.chat?.close();
    this.chat = null;
    this._started = false;
    for (const p of this.blobs.values()) p.then((u) => URL.revokeObjectURL(u), () => {});
    this.blobs.clear();
  }

  attributeChangedCallback(name, old, value) {
    if (name === 'peer' && this.chat?.me && value && value !== old) this._openPeer(value);
    else this._maybeStart();
  }

  _tokenSource() {
    if (this._getToken) return this._getToken;
    const tokenUrl = this.getAttribute('token-url');
    if (tokenUrl) {
      return async () => {
        const res = await fetch(tokenUrl, { credentials: 'include', headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
        return (await res.json()).token;
      };
    }
    const token = this.getAttribute('token');
    return token ? async () => this.getAttribute('token') : null;
  }

  async _maybeStart() {
    const server = this.getAttribute('server');
    const getToken = this._tokenSource();
    if (this._started || !this.isConnected || !server || !getToken) return;
    this._started = true;
    try {
      const chat = (this.chat = new PlugChat({ url: server, getToken, e2ee: this.getAttribute('e2ee') !== 'off' }));
      this._subscribe(chat);
      await chat.connect();
      await this._reload();
      if (this.getAttribute('peer')) await this._openPeer(this.getAttribute('peer'));
      this.dispatchEvent(new CustomEvent('plugchat:ready', { detail: { user: chat.me } }));
    } catch (e) {
      this.$list.replaceChildren(h('div', { class: 'hint' }, `Chat is unavailable: ${e.message}`));
      this._started = false;
    }
  }

  // ---- shell ----

  _build() {
    const style = h('style');
    style.textContent = CSS;
    this.$list = h('div', { class: 'list', role: 'list' }, h('div', { class: 'hint' }, 'Connecting…'));
    this.$main = h('section', { class: 'main' }, h('div', { class: 'hint' }, 'Select a conversation to start chatting.'));
    this.$root = h('div', { class: 'root' },
      h('aside', { class: 'side' },
        h('div', { class: 'bar' },
          h('h2', {}, this.getAttribute('heading') ?? 'Chats'),
          h('button', { class: 'icon', icon: 'plus', title: 'New chat', 'aria-label': 'New chat', onclick: () => this._newChatDialog() }),
        ),
        this.$list,
      ),
      this.$main,
    );
    this.$dialog = h('dialog');
    this.$dialog.addEventListener('click', (e) => e.target === this.$dialog && this.$dialog.close());
    this.shadowRoot.append(style, this.$root, this.$dialog);
  }

  _subscribe(chat) {
    chat.on('message', (m) => {
      const state = this.msgs.get(m.conversationId);
      if (state && !state.list.some((x) => x.id === m.id)) state.list.push(m);
      this._renderList();
      if (m.conversationId === this.activeId) {
        this._clearTyping(m.conversationId, m.senderId);
        this._renderMessages({ stick: true });
        this._markRead();
      }
      this._announceUnread();
      if (m.senderId !== chat.me.id) this.dispatchEvent(new CustomEvent('plugchat:message', { detail: { message: m } }));
    });
    chat.on('message.updated', (m) => this._patch(m.conversationId, m.id, () => m));
    chat.on('message.deleted', (e) => {
      const state = this.msgs.get(e.conversationId);
      if (state && e.expired) state.list = state.list.filter((m) => m.id !== e.messageId);
      else this._patch(e.conversationId, e.messageId, (m) => ({ ...m, deleted: true, text: '', file: null, reactions: {} }));
      const conv = this.convs.get(e.conversationId);
      if (conv?.lastMessage?.id === e.messageId) conv.lastMessage = e.expired ? null : { ...conv.lastMessage, deleted: true, text: '' };
      this._renderList();
      if (e.conversationId === this.activeId) this._renderMessages();
    });
    chat.on('reaction', (e) => this._patch(e.conversationId, e.messageId, (m) => ({ ...m, reactions: e.reactions })));
    chat.on('read', (e) => {
      if (e.userId === chat.me.id) (this._renderList(), this._announceUnread());
      else if (e.conversationId === this.activeId) this._renderMessages();
    });
    chat.on('typing', (e) => {
      let who = this.typing.get(e.conversationId);
      if (!who) this.typing.set(e.conversationId, (who = new Map()));
      clearTimeout(who.get(e.userId));
      who.set(e.userId, setTimeout(() => this._clearTyping(e.conversationId, e.userId), 4000));
      this._renderTyping();
    });
    chat.on('presence', () => (this._renderList(), this._renderHeader()));
    chat.on('conversation', (c) => {
      this.convs.set(c.id, c);
      this._renderList();
      if (c.id === this.activeId) this._renderHeader();
    });
    chat.on('conversation.removed', (e) => {
      this.convs.delete(e.conversationId);
      this.msgs.delete(e.conversationId);
      if (e.conversationId === this.activeId) this._select(null);
      this._renderList();
    });
    chat.on('connection', (e) => {
      if (!e.reconnected) return;
      // Catch up on whatever happened while we were offline.
      this.msgs.clear();
      this._reload().then(() => this.activeId && this._select(this.activeId));
    });
  }

  async _reload() {
    this.convs = new Map((await this.chat.conversations()).map((c) => [c.id, c]));
    this._renderList();
    this._announceUnread();
  }

  _announceUnread() {
    const count = [...this.convs.values()].reduce((n, c) => n + c.unread, 0);
    if (count === this._lastUnread) return;
    this._lastUnread = count;
    this.dispatchEvent(new CustomEvent('plugchat:unread', { detail: { count } }));
  }

  _patch(conversationId, messageId, fn) {
    const state = this.msgs.get(conversationId);
    if (state) state.list = state.list.map((m) => (m.id === messageId ? fn(m) : m));
    const conv = this.convs.get(conversationId);
    if (conv?.lastMessage?.id === messageId) conv.lastMessage = fn(conv.lastMessage);
    this._renderList();
    if (conversationId === this.activeId) this._renderMessages();
  }

  // ---- naming helpers ----

  _other(conv) {
    return conv.members.find((m) => m.userId !== this.chat.me.id) ?? conv.members[0];
  }
  _title(conv) {
    return conv.type === 'group' ? conv.title : this._other(conv)?.name ?? 'Unknown';
  }
  _memberName(conv, userId) {
    return conv.members.find((m) => m.userId === userId)?.name ?? 'Former member';
  }
  _avatar(name, url, { small = false, online = false } = {}) {
    const el = h('div', { class: `avatar${small ? ' sm' : ''}`, 'aria-hidden': 'true' });
    if (url && /^https?:\/\//.test(url)) el.style.backgroundImage = `url("${encodeURI(url)}")`;
    else el.textContent = initials(name);
    el.style.backgroundColor = `hsl(${hue(name)} 45% 45%)`;
    if (online) el.append(h('span', { class: 'dot' }));
    return el;
  }
  _preview(conv, m) {
    if (!m) return conv.encrypted ? 'Encrypted conversation' : 'No messages yet';
    if (m.deleted) return 'Message deleted';
    if (m.undecryptable) return 'Encrypted message';
    const who = m.kind === 'system' ? '' : m.senderId === this.chat.me.id ? 'You: ' : conv.type === 'group' ? `${this._memberName(conv, m.senderId).split(' ')[0]}: ` : '';
    return who + (m.text || (m.file ? `📎 ${m.file.name}` : ''));
  }

  // ---- conversation list ----

  _renderList() {
    if (!this.chat?.me) return;
    const convs = [...this.convs.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!convs.length) return this.$list.replaceChildren(h('div', { class: 'hint' }, 'No conversations yet. Press + to start one.'));
    this.$list.replaceChildren(...convs.map((c) => {
      const other = c.type === 'dm' ? this._other(c) : null;
      const title = this._title(c);
      return h('button', { class: 'conv', role: 'listitem', 'aria-current': String(c.id === this.activeId), onclick: () => this._select(c.id) },
        this._avatar(title, other?.avatar, { online: !!other && this.chat.online.has(other.userId) }),
        h('div', { class: 'body' },
          h('div', { class: 'line' }, h('span', { class: 'name' }, title), c.lastMessage && h('span', { class: 'when' }, shortWhen(c.lastMessage.createdAt))),
          h('div', { class: 'line' },
            h('span', { class: 'preview' }, this._preview(c, c.lastMessage)),
            c.unread > 0 && c.id !== this.activeId && h('span', { class: 'badge', 'aria-label': `${c.unread} unread` }, c.unread > 99 ? '99+' : String(c.unread)),
          ),
        ),
      );
    }));
  }

  // ---- thread ----

  async _openPeer(userId) {
    try {
      const conv = await this.chat.openDm(userId);
      this.convs.set(conv.id, conv);
      await this._select(conv.id);
    } catch (e) {
      this._error(e.message);
    }
  }

  async _select(id) {
    this.activeId = id;
    this.replyTo = this.editing = this.pendingFile = null;
    this.$root.classList.toggle('open', !!id);
    this._renderList();
    if (!id) return this.$main.replaceChildren(h('div', { class: 'hint' }, 'Select a conversation to start chatting.'));

    this.$header = h('div', { class: 'bar' });
    this.$msgs = h('div', { class: 'msgs', role: 'log', 'aria-live': 'polite' });
    this.$typing = h('div', { class: 'typing' });
    this.$error = h('div', { class: 'error', hidden: true, role: 'alert' });
    this.$banner = h('div', { class: 'banner', hidden: true });
    this.$input = h('textarea', { rows: '1', placeholder: 'Message', 'aria-label': 'Message',
      oninput: () => this._onInput(),
      onkeydown: (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) (e.preventDefault(), this._submit());
        if (e.key === 'Escape') this._setDraftMode(null);
      },
    });
    this.$file = h('input', { type: 'file', hidden: true, onchange: () => {
      this.pendingFile = this.$file.files[0] ?? null;
      this.$file.value = '';
      this._renderBanner();
      this._onInput();
    } });
    this.$send = h('button', { class: 'icon sendbtn', icon: 'send', type: 'submit', title: 'Send', 'aria-label': 'Send', disabled: true });
    this.$main.replaceChildren(
      this.$header, this.$msgs, this.$typing, this.$error, this.$banner,
      h('form', { class: 'composer', onsubmit: (e) => (e.preventDefault(), this._submit()) },
        this.$file,
        h('button', { class: 'icon', icon: 'clip', type: 'button', title: 'Attach a file', 'aria-label': 'Attach a file', onclick: () => this.$file.click() }),
        this.$input, this.$send,
      ),
    );
    this._renderHeader();

    if (!this.msgs.has(id)) {
      this.$msgs.replaceChildren(h('div', { class: 'hint' }, 'Loading…'));
      try {
        const list = await this.chat.messages(id);
        this.msgs.set(id, { list, more: list.length === 50 });
      } catch (e) {
        if (this.activeId === id) this.$msgs.replaceChildren(h('div', { class: 'hint' }, `Could not load messages: ${e.message}`));
        return;
      }
      if (this.activeId !== id) return;
    }
    this._renderMessages({ stick: true, instant: true });
    this._markRead();
    this.$input.focus({ preventScroll: true });
  }

  _renderHeader() {
    const conv = this.convs.get(this.activeId);
    if (!conv || !this.$header) return;
    const other = conv.type === 'dm' ? this._other(conv) : null;
    const status = other ? (this.chat.online.has(other.userId) ? 'Online' : 'Offline') : `${conv.members.length} members`;
    this.$header.replaceChildren(
      h('button', { class: 'icon backbtn', icon: 'back', title: 'Back', 'aria-label': 'Back to conversations', onclick: () => this._select(null) }),
      this._avatar(this._title(conv), other?.avatar, { online: !!other && this.chat.online.has(other.userId) }),
      h('div', { class: 'title' },
        h('div', { class: 'name' }, this._title(conv)),
        h('div', { class: 'sub' },
          conv.encrypted && h('span', { icon: 'lock', title: 'End-to-end encrypted' }),
          conv.ttlSeconds && h('span', { icon: 'timer', title: 'Disappearing messages are on' }),
          h('span', {}, conv.encrypted ? `End-to-end encrypted · ${status}` : status),
        ),
      ),
      h('button', { class: 'icon', icon: 'info', title: 'Conversation details', 'aria-label': 'Conversation details', onclick: () => this._detailsDialog(conv) }),
    );
  }

  _renderTyping() {
    const conv = this.convs.get(this.activeId);
    if (!conv || !this.$typing) return;
    const names = [...(this.typing.get(conv.id)?.keys() ?? [])].map((id) => this._memberName(conv, id).split(' ')[0]);
    this.$typing.textContent = names.length === 0 ? '' : names.length === 1 ? `${names[0]} is typing…` : `${names.join(', ')} are typing…`;
  }

  _clearTyping(conversationId, userId) {
    const who = this.typing.get(conversationId);
    clearTimeout(who?.get(userId));
    who?.delete(userId);
    this._renderTyping();
  }

  _renderMessages({ stick = false, instant = false } = {}) {
    const conv = this.convs.get(this.activeId);
    const state = this.msgs.get(this.activeId);
    if (!conv || !state || !this.$msgs) return;
    const box = this.$msgs;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const me = this.chat.me.id;
    const byId = new Map(state.list.map((m) => [m.id, m]));
    const othersRead = Math.min(...conv.members.filter((m) => m.userId !== me).map((m) => m.lastReadSeq), Infinity);

    const nodes = [];
    if (state.more) nodes.push(h('button', { class: 'more', onclick: () => this._loadOlder() }, 'Load earlier messages'));
    if (!state.list.length) nodes.push(h('div', { class: 'hint' }, conv.encrypted ? 'Messages here are end-to-end encrypted. Say hello.' : 'No messages yet. Say hello.'));

    let prev = null;
    for (const m of state.list) {
      const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
      if (newDay) nodes.push(h('div', { class: 'day' }, dayLabel(m.createdAt)));
      if (m.kind === 'system') {
        nodes.push(h('div', { class: 'sys' }, m.text));
        prev = null;
        continue;
      }
      const mine = m.senderId === me;
      const first = newDay || !prev || prev.senderId !== m.senderId || m.createdAt - prev.createdAt > 5 * 60_000;
      const showAvatars = conv.type === 'group' && !mine;
      const name = this._memberName(conv, m.senderId);

      let bubble;
      if (m.deleted) bubble = h('div', { class: 'bubble ghost' }, 'Message deleted');
      else if (m.undecryptable) bubble = h('div', { class: 'bubble ghost' }, 'This message was encrypted for a different device.');
      else {
        const parent = m.replyTo && byId.get(m.replyTo);
        bubble = h('div', { class: 'bubble' },
          showAvatars && first && h('div', { class: 'sender' }, name),
          m.replyTo && h('div', { class: 'quote' }, parent ? `${this._memberName(conv, parent.senderId)}: ${parent.deleted ? 'Message deleted' : parent.text || parent.file?.name || ''}` : 'Earlier message'),
          m.file && this._attachment(m),
          linkify(m.text),
          h('span', { class: 'meta' },
            m.expiresAt && h('span', { icon: 'timer', title: 'Disappearing message' }),
            m.editedAt && 'edited ·',
            clock(m.createdAt),
            mine && h('span', { title: m.seq <= othersRead ? 'Read' : 'Sent' }, m.seq <= othersRead ? '✓✓' : '✓'),
          ),
        );
      }

      const reacts = Object.entries(m.reactions ?? {});
      const row = h('div', { class: `row${mine ? ' mine' : ''}${first ? ' first' : ''}` },
        showAvatars && (first ? this._avatar(name, conv.members.find((x) => x.userId === m.senderId)?.avatar, { small: true }) : h('div', { class: 'spacer' })),
        h('div', { class: 'col' },
          bubble,
          reacts.length > 0 && h('div', { class: 'reacts' }, reacts.map(([emoji, users]) =>
            h('button', {
              class: `react${users.includes(me) ? ' on' : ''}`,
              title: users.map((u) => this._memberName(conv, u)).join(', '),
              onclick: () => this._toggleReaction(m, emoji),
            }, `${emoji} ${users.length}`))),
        ),
        !m.deleted && !m.undecryptable && this._actions(m, mine, conv),
      );
      bubble.addEventListener('click', (e) => {
        if (e.target.closest('a, button')) return;
        for (const el of box.querySelectorAll('.row.active')) if (el !== row) el.classList.remove('active');
        row.classList.toggle('active');
      });
      nodes.push(row);
      prev = m;
    }

    const keep = box.scrollHeight - box.scrollTop;
    box.replaceChildren(...nodes);
    if (stick && (nearBottom || instant)) {
      if (instant) box.style.scrollBehavior = 'auto';
      box.scrollTop = box.scrollHeight;
      if (instant) box.style.scrollBehavior = '';
    } else if (!stick) {
      box.style.scrollBehavior = 'auto';
      box.scrollTop = nearBottom ? box.scrollHeight : box.scrollHeight - keep;
      box.style.scrollBehavior = '';
    }
  }

  _actions(m, mine, conv) {
    const myRole = conv.members.find((x) => x.userId === this.chat.me.id)?.role;
    const canDelete = mine || (conv.type === 'group' && myRole !== 'member');
    const picker = h('span', { hidden: true }, QUICK_REACTIONS.map((emoji) =>
      h('button', { class: 'emoji', 'aria-label': `React ${emoji}`, onclick: () => this._toggleReaction(m, emoji) }, emoji)));
    return h('div', { class: 'acts' },
      picker,
      h('button', { class: 'icon', icon: 'smile', title: 'React', 'aria-label': 'React', onclick: () => (picker.hidden = !picker.hidden) }),
      h('button', { class: 'icon', icon: 'reply', title: 'Reply', 'aria-label': 'Reply', onclick: () => this._setDraftMode({ replyTo: m }) }),
      mine && h('button', { class: 'icon', icon: 'edit', title: 'Edit', 'aria-label': 'Edit', onclick: () => this._setDraftMode({ editing: m }) }),
      canDelete && h('button', { class: 'icon danger', icon: 'trash', title: 'Delete', 'aria-label': 'Delete', onclick: () => this._guard(this.chat.remove(m.id)) }),
    );
  }

  _attachment(m) {
    const label = `${m.file.name} (${size(m.file.size)})`;
    const save = async () => {
      const url = URL.createObjectURL(await this.chat.download(m));
      h('a', { href: url, download: m.file.name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    };
    if (INLINE_IMAGES.has(m.file.mime) && m.file.size <= 5 * 1048576) {
      const img = h('img', { class: 'pic', alt: m.file.name, title: label });
      let url = this.blobs.get(m.file.fileId);
      if (!url) this.blobs.set(m.file.fileId, (url = this.chat.download(m).then((b) => URL.createObjectURL(b))));
      url.then((u) => (img.src = u), () => (img.alt = 'Image unavailable'));
      return img;
    }
    return h('button', { class: 'file', onclick: () => this._guard(save()) }, h('span', { icon: 'clip' }), label);
  }

  async _loadOlder() {
    const id = this.activeId;
    const state = this.msgs.get(id);
    if (!state?.list.length) return;
    const older = await this.chat.messages(id, { before: state.list[0].seq });
    state.list = [...older, ...state.list];
    state.more = older.length === 50;
    if (this.activeId === id) this._renderMessages();
  }

  _markRead() {
    const conv = this.convs.get(this.activeId);
    if (!conv || document.visibilityState !== 'visible' || conv.unread === 0) return;
    conv.unread = 0;
    this._renderList();
    this._announceUnread();
    this.chat.read(conv.id, conv.lastSeq).catch(() => {});
  }

  _toggleReaction(m, emoji) {
    const mine = m.reactions?.[emoji]?.includes(this.chat.me.id);
    this._guard(mine ? this.chat.unreact(m.id, emoji) : this.chat.react(m.id, emoji));
  }

  // ---- composer ----

  _onInput() {
    const el = this.$input;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 120)}px`;
    this.$send.disabled = !el.value.trim() && !this.pendingFile;
    const t = Date.now();
    if (el.value && t - (this._typedAt ?? 0) > 2000) {
      this._typedAt = t;
      this.chat.typing(this.activeId);
    }
  }

  _setDraftMode(mode) {
    this.replyTo = mode?.replyTo ?? null;
    this.editing = mode?.editing ?? null;
    if (this.editing) this.$input.value = this.editing.text;
    else if (!mode) this.pendingFile = null;
    this._renderBanner();
    this._onInput();
    this.$input.focus();
  }

  _renderBanner() {
    const conv = this.convs.get(this.activeId);
    const text = this.editing ? 'Editing message'
      : this.replyTo ? `Replying to ${this._memberName(conv, this.replyTo.senderId)}: ${this.replyTo.text || this.replyTo.file?.name || ''}`
      : this.pendingFile ? `Attached: ${this.pendingFile.name} (${size(this.pendingFile.size)})` : null;
    this.$banner.hidden = !text;
    if (text) {
      this.$banner.replaceChildren(
        h('span', {}, this.pendingFile && (this.editing || this.replyTo) ? `${text} · 📎 ${this.pendingFile.name}` : text),
        h('button', { class: 'icon', icon: 'close', title: 'Cancel', 'aria-label': 'Cancel', onclick: () => {
          if (this.editing) this.$input.value = '';
          this._setDraftMode(null);
        } }),
      );
    }
  }

  async _submit() {
    const text = this.$input.value.trim();
    const { editing, replyTo, pendingFile: file, activeId: id } = this;
    if (!text && !file) return;
    this.$input.value = '';
    this._setDraftMode(null);
    try {
      if (editing) await this.chat.edit(editing, text);
      else await this.chat.send(id, { text, file, replyTo: replyTo?.id });
    } catch (e) {
      if (this.activeId === id && !this.$input.value) (this.$input.value = text), this._onInput();
      this._error(e.message);
    }
  }

  _guard(promise) {
    promise.catch((e) => this._error(e.message));
  }

  _error(message) {
    if (!this.$error) return console.error('plugchat:', message);
    this.$error.textContent = message;
    this.$error.hidden = false;
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => (this.$error.hidden = true), 6000);
  }

  // ---- dialogs ----

  _openDialog(...content) {
    this.$dialog.replaceChildren(...content);
    if (!this.$dialog.open) this.$dialog.showModal();
  }

  _dialogTitle(text) {
    return h('h3', {}, h('span', {}, text), h('button', { class: 'icon', icon: 'close', type: 'button', 'aria-label': 'Close', onclick: () => this.$dialog.close() }));
  }

  _newChatDialog() {
    if (!this.chat?.me) return;
    const picked = new Map();
    const $people = h('div', { class: 'people' });
    const $title = h('input', { type: 'text', placeholder: 'Group name', maxlength: '120', 'aria-label': 'Group name', hidden: true });
    const $e2ee = h('input', { type: 'checkbox' });
    const $err = h('div', { class: 'error', hidden: true, role: 'alert' });
    const $go = h('button', { class: 'btn', type: 'submit', disabled: true }, 'Start chat');
    const sync = () => {
      $title.hidden = picked.size < 2;
      $go.disabled = picked.size === 0;
      $go.textContent = picked.size > 1 ? `Create group (${picked.size + 1})` : 'Start chat';
    };
    let ticket = 0;
    const search = async (q) => {
      const mine = ++ticket;
      let users = [];
      try {
        users = await this.chat.searchUsers(q);
      } catch (e) {
        return $people.replaceChildren(h('div', { class: 'hint' }, e.message));
      }
      if (mine !== ticket) return;
      for (const u of picked.values()) if (!users.some((x) => x.id === u.id)) users.unshift(u);
      if (!users.length) return $people.replaceChildren(h('div', { class: 'hint' }, 'Nobody found.'));
      $people.replaceChildren(...users.map((u) => {
        const box = h('input', { type: 'checkbox', checked: picked.has(u.id), onchange: () => {
          if (box.checked) picked.set(u.id, u);
          else picked.delete(u.id);
          sync();
        } });
        return h('label', { class: 'person' }, box, this._avatar(u.name, u.avatar, { small: true, online: u.online }), h('span', {}, u.name));
      }));
    };
    const form = h('form', { onsubmit: async (e) => {
      e.preventDefault();
      $go.disabled = true;
      try {
        const ids = [...picked.keys()];
        const encrypted = $e2ee.checked;
        const conv = ids.length === 1
          ? await this.chat.openDm(ids[0], { encrypted })
          : await this.chat.createGroup({ title: $title.value.trim() || [...picked.values()].map((u) => u.name.split(' ')[0]).join(', ').slice(0, 120), memberIds: ids, encrypted });
        this.convs.set(conv.id, conv);
        this.$dialog.close();
        this._select(conv.id);
      } catch (err) {
        $err.textContent = err.message;
        $err.hidden = false;
        sync();
      }
    } },
      this._dialogTitle('New chat'),
      h('input', { type: 'search', placeholder: 'Search people', 'aria-label': 'Search people', autofocus: true, oninput: (e) => search(e.target.value) }),
      $people, $title,
      this.getAttribute('e2ee') !== 'off' && h('label', { class: 'check' }, $e2ee,
        h('span', {}, 'End-to-end encrypt', h('small', {}, 'Only members can read messages, on the device where they joined. Not even the server can.'))),
      $err, $go,
    );
    this._openDialog(form);
    search('');
  }

  async _detailsDialog(conv) {
    const me = this.chat.me.id;
    const myRole = conv.members.find((m) => m.userId === me)?.role;
    const canManage = conv.type === 'dm' || myRole !== 'member';
    const $err = h('div', { class: 'error', hidden: true, role: 'alert' });
    const run = async (p, close = false) => {
      try {
        await p;
        if (close) this.$dialog.close();
      } catch (e) {
        $err.textContent = e.message;
        $err.hidden = false;
      }
    };
    const $timer = h('select', { disabled: !canManage, onchange: () => run(this.chat.update(conv.id, { ttlSeconds: Number($timer.value) || null })) },
      TIMERS.map(([s, label]) => h('option', { value: String(s), selected: (conv.ttlSeconds ?? 0) === s }, label)));
    const $code = h('div', { class: 'code' }, '…');
    if (conv.encrypted) this.chat.safetyCode(conv.id).then((c) => ($code.textContent = c), () => ($code.textContent = 'unavailable'));
    const other = conv.type === 'dm' ? this._other(conv) : null;
    const blocked = other ? (await this.chat.blocked().catch(() => [])).includes(other.userId) : false;

    this._openDialog(h('div', { class: 'panel' },
      this._dialogTitle(this._title(conv)),
      h('div', { class: 'people' }, conv.members.map((m) =>
        h('div', { class: 'person' }, this._avatar(m.name, m.avatar, { small: true, online: this.chat.online.has(m.userId) }),
          h('span', {}, m.userId === me ? `${m.name} (you)` : m.name), m.role !== 'member' && h('small', {}, m.role),
          conv.type === 'group' && canManage && m.userId !== me && m.role !== 'owner'
            && h('button', { class: 'icon', icon: 'close', title: `Remove ${m.name}`, 'aria-label': `Remove ${m.name}`, onclick: () => run(this.chat.removeMember(conv.id, m.userId), true) })))),
      h('label', { class: 'field' }, 'Disappearing messages', $timer),
      conv.encrypted && h('label', { class: 'field' }, 'Safety code — compare with the other members in person. If it matches, nobody has tampered with your keys.', $code),
      $err,
      conv.type === 'group' && h('button', { class: 'btn warn', onclick: () => run(this.chat.leave(conv.id), true) }, 'Leave group'),
      other && h('button', { class: 'btn warn', onclick: () => run(blocked ? this.chat.unblock(other.userId) : this.chat.block(other.userId), true) }, blocked ? `Unblock ${other.name}` : `Block ${other.name}`),
    ));
  }
}

if (!customElements.get('plug-chat')) customElements.define('plug-chat', PlugChatElement);
export { PlugChatElement };
