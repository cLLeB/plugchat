// <plug-chat> — the drop-in chat UI. A standard custom element, so it works
// the same in React, Vue, Angular, Svelte, server-rendered pages and WebViews.
//
//   <script type="module" src="https://your-host/plugchat/client/element.js"></script>
//   <plug-chat server="https://your-host/plugchat" token-url="/api/chat-token"></plug-chat>
//
// All user-provided text is inserted with textContent, never as HTML.
import { PlugChat } from './plugchat.js';
import { CallManager } from './calls.js';
import { STYLE } from './styles.js';
import { DICTIONARIES } from './i18n.js';

// One language per page: taken from the element's lang attribute, else <html lang>.
let DICT = {};
let LOCALE = [];
function setLanguage(lang, overrides) {
  const code = (lang || '').toLowerCase();
  DICT = { ...(DICTIONARIES[code] ?? DICTIONARIES[code.split('-')[0]] ?? {}), ...overrides };
  LOCALE = lang ? [lang] : [];
}
/** Translate a UI string. English text is the key; {name} placeholders are filled from vars. */
function T(text, vars) {
  let out = DICT[text] ?? text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICON = {
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
  send: svg('<path d="M4 12l16-8-6 16-3-7-7-1z"/>'),
  clip: svg('<path d="M20 11l-8.5 8.5a5 5 0 01-7-7L13 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L14 7"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  reply: svg('<path d="M10 8L5 12l5 4M5 12h9a5 5 0 015 5v1"/>'),
  forward: svg('<path d="M14 8l5 4-5 4M19 12h-9a5 5 0 00-5 5v1"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>'),
  trash: svg('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'),
  smile: svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 007 0M9 9.5v.5M15 9.5v.5"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  checks: svg('<path d="M2 12.5l4.5 4.5L16 7.5M11 15.5l1.5 1.5L22 7.5"/>'),
  chevron: svg('<path d="M6 9l6 6 6-6"/>'),
  more: svg('<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>'),
  play: svg('<path d="M8 5.5v13l11-6.5z"/>'),
  pause: svg('<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>'),
  download: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
  image: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 15l-5-4-7 7"/>'),
  bubbles: svg('<path d="M4 5h11v8H9l-3 3v-3H4zM15 9h5v8h-2v3l-3-3h-4v-2"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  archive: svg('<path d="M3 5h18v4H3zM5 9v10h14V9M10 13h4"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
  moon: svg('<path d="M20 14.5A8.5 8.5 0 019.5 4a7 7 0 1010.5 10.5z"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'),
  star: svg('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>'),
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  pin: svg('<path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7"/>'),
  flag: svg('<path d="M5 21V4h11l-2 4 2 4H5"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>'),
  video: svg('<rect x="3" y="6" width="12" height="12" rx="2"/><path d="M15 10l6-3v10l-6-3"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>'),
  stop: svg('<rect x="7" y="7" width="10" height="10" rx="1.5"/>'),
  poll: svg('<path d="M5 20V10M12 20V4M19 20v-7"/>'),
  map: svg('<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  mute: svg('<path d="M6 9a6 6 0 0110-4.5M18 9c0 5 2 6 2 6H9M4 4l16 16M10 20a2 2 0 004 0"/>'),
  file: svg('<path d="M7 3h7l4 4v14H7zM14 3v4h4"/>'),
};
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const EMOJI_SETS = {
  smileys: [...'😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😋😛😜🤪😝🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬😌😔😪😴😷🤒🤕🤢🤮🥵🥶😵🤯🤠🥳😎🤓😕😟🙁😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈💀💩🤡👻👽🤖'],
  gestures: [...'👍👎👊✊🤛🤜👏🙌👐🤲🤝🙏✍💅🤳💪👈👉👆👇✋🤚🖐🖖👋🤙👌🤏✌🤞🤟🤘👀👁👅👄👂👃🧠🫶'],
  hearts: [...'❤🧡💛💚💙💜🖤🤍🤎💔❣💕💞💓💗💖💘💝💟💌💋💍💎'],
  celebration: [...'🎉🎊🎈🎂🎁🎀🏆🥇🥈🥉🏅🎖🎯🎮🎲🎵🎶🎤🎧🎸🎹🥁🎬🎨🔥✨⭐🌟💫💥💯✅❌❓❗💤💢'],
  nature: [...'🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🦆🦉🦄🐝🦋🐢🐍🐙🐬🐳🌸🌹🌺🌻🌼🌷🌱🌲🌴🍀🍁🍂🌍🌙☀⛅🌧⛈🌈❄⚡💧🌊'],
  food: [...'🍏🍎🍐🍊🍋🍌🍉🍇🍓🍒🍑🥭🍍🥥🥑🍅🥕🌽🍞🧀🍳🥞🍗🍖🌭🍔🍟🍕🥪🌮🍝🍜🍚🍣🍰🧁🍫🍬🍭🍩🍪☕🍵🥤🍺🍷🥂'],
  things: [...'📱💻⌨🖥📷📹🎥📞☎📺📻⏰⏳💡🔦💰💳🛒🎒📚📖✏📝📌📎✂🔑🔒🔓🔔📣📢💬💭🗓📅📁🗑🚗🚕🚌🚲✈🚀🏠🏢🏥🏫⚽🏀🏈🎾🏐'],
};
const INLINE_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const PLAYABLE = /^(audio\/(webm|ogg|mpeg|mp4|wav|x-wav|aac)|video\/(mp4|webm))$/;
const TIMERS = [[0, 'Off'], [60, '1 minute'], [3600, '1 hour'], [86400, '1 day'], [604800, '1 week']];
const REPORT_REASONS = ['Spam', 'Harassment or bullying', 'Scam or fraud', 'Inappropriate content', 'Something else'];

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'icon') el.innerHTML = ICON[v]; // static markup only
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

// Like replaceChildren, but drops null/false and flattens arrays the way h() does.
const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((c) => c != null && c !== false));

const hue = (s) => [...s].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 360, 7);
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0].toUpperCase()).join('') || '?';
const first = (name) => name.split(/\s+/)[0];
const clock = (t) => new Date(t).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
const dayLabel = (t) => {
  const d = new Date(t), today = new Date();
  if (d.toDateString() === today.toDateString()) return T('Today');
  if (d.toDateString() === new Date(today - 864e5).toDateString()) return T('Yesterday');
  return d.toLocaleDateString(LOCALE, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};
const shortWhen = (t) => (new Date(t).toDateString() === new Date().toDateString() ? clock(t) : new Date(t).toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' }));
const size = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const debounce = (fn, ms) => {
  let t;
  return (...a) => (clearTimeout(t), (t = setTimeout(() => fn(...a), ms)));
};

// Who can be @mentioned in the conversation on screen (lower-cased first names).
let mentionable = new Set();
// One to three emoji and nothing else: shown large, without a bubble.
const JUMBO = /^(?:\p{Extended_Pictographic}(?:\ufe0f|\u200d\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s?){1,3}$/u;

/**
 * Message text as nodes: links become links, *bold* _italic_ ~strike~ `code`
 * are styled the way messengers do, and @names of members are highlighted.
 * Everything else stays plain text; nothing is ever parsed as HTML.
 */
function linkify(text) {
  const out = [];
  let last = 0;
  const pattern = /(https?:\/\/[^\s<>"']+)|(?<![\p{L}\p{N}])([*_~`])(?=\S)([^\n]*?\S)\2(?![\p{L}\p{N}])|@([\p{L}\p{N}_]+)/gu;
  for (const m of text.matchAll(pattern)) {
    let node;
    if (m[1]) node = h('a', { href: m[1], target: '_blank', rel: 'noopener noreferrer nofollow' }, m[1]);
    else if (m[2]) node = h({ '*': 'strong', _: 'em', '~': 's', '`': 'code' }[m[2]], {}, m[2] === '`' ? m[3] : linkify(m[3]));
    else if (mentionable.has(m[4].toLowerCase())) node = h('span', { class: 'at' }, m[0]);
    else continue;
    out.push(text.slice(last, m.index), node);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

class PlugChatElement extends HTMLElement {
  static observedAttributes = ['server', 'token', 'token-url', 'peer', 'peer-handle', 'heading', 'invite'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.chat = null;
    this.calls = null;
    this.convs = new Map();
    this.msgs = new Map(); // conversationId -> { list, more }
    this.pins = [];
    this.opened = new Map(); // view-once content this device was handed, kept until the thread closes
    this.feed = [];
    this.hits = [];
    this.query = '';
    this.showArchived = false;
    this.activeId = null;
    this.typing = new Map(); // conversationId -> Map<userId, timer>
    this.blobs = new Map(); // fileId -> Promise<objectURL>
    this.replyTo = null;
    this.editing = null;
    this.pendingFile = null;
    this.viewOnce = false;
    this.lastSeen = new Map(); // userId -> timestamp, for "last seen" in one-to-one chats
    this._below = 0; // messages that arrived while scrolled up
    this.players = new Map(); // messageId -> { el, audio }: voice notes keep playing across re-renders
    this.filter = 'all'; // chat list filter: all | unread | groups
    this._popEl = null; // the open reaction strip or message menu
    this._mention = null; // open @-mention picker: { start, items, index }
    /** Host-supplied renderers for custom message types: { [type]: (message) => Node | string }. */
    this.renderers ??= {};
    /** Host-supplied entries for the attach menu: [{ label, run({ conversation, chat, element }) }]. */
    this.actions ??= [];
    this._getToken = null;
    this._started = false;
    // A framework may have set getToken before this element class was loaded.
    if (Object.hasOwn(this, 'getToken')) {
      const fn = this.getToken;
      delete this.getToken;
      this._getToken = fn;
    }
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
    this._onPop = () => {
      if (!this._pushed) return;
      this._pushed = false;
      if (this.$dialog.open) this.$dialog.close();
      this.$root.querySelector('.storyfs')?.remove();
      if (this.activeId) this._select(null);
    };
    window.addEventListener('popstate', this._onPop);
    this._maybeStart();
  }

  disconnectedCallback() {
    document.removeEventListener('visibilitychange', this._onVisible);
    window.removeEventListener('popstate', this._onPop);
    clearTimeout(this._storyTimer);
    this.calls?.close();
    this._stopRecording(true);
    for (const player of this.players.values()) player.audio.pause();
    this.chat?.close();
    this.chat = this.calls = null;
    this._started = false;
    for (const p of this.blobs.values()) p.then((u) => URL.revokeObjectURL(u), () => {});
    this.blobs.clear();
  }

  attributeChangedCallback(name, old, value) {
    if (name === 'heading') {
      if (this.$heading) this.$heading.textContent = value ?? T('Chats');
    } else if (name === 'invite') {
      if (this.chat?.me && value && value !== old) this._joinInvite(value).catch((e) => this._error(e.message));
    } else if ((name === 'peer' || name === 'peer-handle') && this.chat?.me && value && value !== old) this._openPeer();
    else this._maybeStart();
  }

  _on(feature) {
    return this.getAttribute(feature) !== 'off';
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
    return this.getAttribute('token') ? async () => this.getAttribute('token') : null;
  }

  async _maybeStart() {
    const server = this.getAttribute('server');
    const getToken = this._tokenSource();
    if (this._started || !this.isConnected || !server || !getToken) return;
    this._started = true;
    try {
      const chat = (this.chat = new PlugChat({ url: server, getToken, e2ee: this._on('e2ee') }));
      this._subscribe(chat);
      await chat.connect();
      if (this._on('calls') && CallManager.supported) {
        this.calls = new CallManager(chat);
        this.calls.on('incoming', (call) => this._showCall(call));
      }
      await this._reload();
      this._loadStories();
      await this._openPeer();
      if (this.getAttribute('invite')) await this._joinInvite(this.getAttribute('invite')).catch((e) => this._error(e.message));
      this.dispatchEvent(new CustomEvent('plugchat:ready', { detail: { user: chat.me } }));
    } catch (e) {
      fill(this.$list, h('div', { class: 'hint' }, T('Chat is unavailable: {reason}', { reason: e.message })));
      this._started = false;
    }
  }

  // ---- shell ----

  _build() {
    // `strings` lets the host override or add translations: el.strings = { 'Send': '…' }.
    const lang = this.getAttribute('lang') || document.documentElement.lang;
    setLanguage(lang, this.strings);
    // Right-to-left scripts mirror the layout. dir="rtl" or dir="ltr" on the element overrides the guess.
    this._dir = this.getAttribute('dir') || (/^(ar|he|fa|ur|ps|sd|yi|dv)\b/i.test(lang ?? '') ? 'rtl' : 'ltr');
    const style = h('style');
    style.textContent = STYLE;
    this.$list = h('div', { class: 'list', role: 'list' }, h('div', { class: 'hint' }, T('Connecting…')));
    this.$stories = h('div', { class: 'stories', hidden: true });
    this.$main = h('section', { class: 'main' }, h('div', { class: 'hint' }, h('span', { icon: 'bubbles' }), T('Select a conversation to start chatting.')));
    const runSearch = debounce(() => this._search(), 250);
    this.$root = h('div', { class: 'root' },
      h('aside', { class: 'side' },
        h('div', { class: 'bar' },
          (this.$heading = h('h2', {}, this.getAttribute('heading') ?? T('Chats'))),
          (this.$theme = h('button', { class: 'icon', onclick: () => this._setTheme(this._dark() ? 'light' : 'dark') })),
          h('button', { class: 'icon', icon: 'gear', title: T('Settings'), 'aria-label': T('Settings'), onclick: () => this._settingsDialog() }),
          h('button', { class: 'icon newbtn', icon: 'plus', title: T('New chat'), 'aria-label': T('New chat'), onclick: () => this._newChatDialog() }),
        ),
        h('div', { class: 'find' }, h('input', { type: 'search', placeholder: T('Search chats and messages'), 'aria-label': T('Search chats and messages'),
          oninput: (e) => {
            this.query = e.target.value;
            this._renderList();
            runSearch();
          } })),
        (this.$chips = h('div', { class: 'chips', hidden: true })),
        this.$stories,
        this.$list,
        h('button', { class: 'fab', icon: 'edit', title: T('New chat'), 'aria-label': T('New chat'), onclick: () => this._newChatDialog() }),
      ),
      this.$main,
    );
    this.$root.dir = this._dir;
    this.$dialog = h('dialog', { dir: this._dir });
    this.$toast = h('div', { class: 'toast', hidden: true, role: 'status' });
    this.$net = h('div', { class: 'net', hidden: true, role: 'status' }, h('span', { class: 'spin' }), T('Connecting…'));
    this.$root.append(this.$toast, this.$net);
    this._hostTheme = this.getAttribute('theme');
    this._setTheme(this._themeChoice(), false);
    this._holdable(this.$list, (e) => {
      const conv = this.convs.get(e.target.closest('.conv[data-id]')?.dataset.id);
      if (conv) this._chatSheet(conv);
    });
    this.$dialog.addEventListener('click', (e) => e.target === this.$dialog && this.$dialog.close());
    // Clicking anywhere else puts the pop-up menus away.
    this.shadowRoot.addEventListener('click', (e) => {
      if (!e.target.closest('.acts')) this._closePop();
      if (e.target.closest('.menu, .sheet, .composer .icon')) return;
      for (const menu of this.shadowRoot.querySelectorAll('.composer > .menu, .composer > .sheet')) menu.hidden = true;
      this._mention = null;
    });
    this.shadowRoot.append(style, this.$root, this.$dialog);
  }

  _subscribe(chat) {
    chat.on('message', (m) => {
      const state = this.msgs.get(m.conversationId);
      // While looking at an older stretch of history, new messages wait until the person jumps back to the latest.
      if (state && !state.moreAfter && !state.list.some((x) => x.id === m.id)) state.list.push(m);
      this._renderList();
      if (m.conversationId === this.activeId) {
        this._clearTyping(m.conversationId, m.senderId);
        if (m.senderId !== chat.me.id && !this.$toBottom.hidden) this._below += 1;
        if (m.senderId !== chat.me.id) this.$live.textContent = this._preview(this.convs.get(m.conversationId), m);
        this._renderMessages({ stick: true });
        this._markRead();
      }
      if (m.senderId !== chat.me.id) this._notify(m);
      if (m.conversationId !== this.activeId) this._renderHeader();
      if (m.kind === 'call' && m.senderId !== chat.me.id && Date.now() - m.createdAt < 45_000) this._ring(m);
      this._announceUnread();
      if (m.senderId !== chat.me.id) this.dispatchEvent(new CustomEvent('plugchat:message', { detail: { message: m } }));
    });
    chat.on('message.updated', (m) => {
      if (m.conversationId === this.activeId) {
        this.pins = this.pins.filter((p) => p.id !== m.id);
        if (m.pinned) this.pins.unshift(m);
        this.pins.sort((a, b) => b.pinned.at - a.pinned.at);
        this._renderPins();
      }
      this._patch(m.conversationId, m.id, (old) => ({ ...m, starred: old.starred }));
    });
    chat.on('message.deleted', (e) => {
      const state = this.msgs.get(e.conversationId);
      if (state && e.expired) state.list = state.list.filter((m) => m.id !== e.messageId);
      else this._patch(e.conversationId, e.messageId, (m) => ({ ...m, deleted: true, text: '', file: null, reactions: {}, pinned: null }));
      const conv = this.convs.get(e.conversationId);
      if (conv?.lastMessage?.id === e.messageId) conv.lastMessage = e.expired ? null : { ...conv.lastMessage, deleted: true, text: '' };
      this.pins = this.pins.filter((p) => p.id !== e.messageId);
      this._renderList();
      if (e.conversationId === this.activeId) (this._renderPins(), this._renderMessages());
    });
    // Keys restored from a backup: what could not be read before may be readable now.
    chat.on('keys', () => {
      this.msgs.clear();
      this._reload().then(() => this.activeId && this._select(this.activeId));
    });
    chat.on('scheduled.failed', (e) => this._error(T('Could not be sent: {reason}', { reason: e.error })));
    chat.on('user.updated', () => {
      this._renderList();
      this._renderHeader();
      if (this.activeId) this._renderMessages();
    });
    chat.on('star', (e) => this._patch(e.conversationId, e.messageId, (m) => ({ ...m, starred: e.starred })));
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
    chat.on('presence', (e) => {
      if (!e.online && e.lastSeen) this.lastSeen.set(e.userId, e.lastSeen);
      this._renderList();
      this._renderHeader();
    });
    chat.on('conversation', (c) => {
      this.convs.set(c.id, c);
      // Keys may just have arrived from another device: retry what could not be read.
      if (this.msgs.get(c.id)?.list.some((m) => m.undecryptable)) {
        this.msgs.delete(c.id);
        if (c.id === this.activeId) this._select(c.id);
      }
      this._renderList();
      this._announceUnread();
      if (c.id === this.activeId) (this._renderHeader(), this._renderComposerState(), this._renderDeviceNotice());
    });
    chat.on('conversation.removed', (e) => {
      this.convs.delete(e.conversationId);
      this.msgs.delete(e.conversationId);
      if (e.conversationId === this.activeId) this._select(null);
      this._renderList();
    });
    for (const type of ['story.new', 'story.deleted', 'story.viewed']) chat.on(type, () => this._loadStories());
    chat.on('connection', (e) => {
      // Say so while the link to the server is down; messages typed meanwhile wait with a retry.
      this.$net.hidden = e.state === 'connected';
      if (!e.reconnected) return;
      // Catch up on whatever happened while we were offline.
      this.msgs.clear();
      this._loadStories();
      this._reload().then(() => this.activeId && this._select(this.activeId));
    });
  }

  async _reload() {
    this.convs = new Map((await this.chat.conversations()).map((c) => [c.id, c]));
    this._renderList();
    this._announceUnread();
  }

  _announceUnread() {
    const count = [...this.convs.values()].reduce((n, c) => n + (c.muted ? 0 : c.unread), 0);
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
    return conv.type === 'group' ? conv.title : this._other(conv)?.name ?? T('Unknown');
  }
  _memberName(conv, userId) {
    return conv?.members.find((m) => m.userId === userId)?.name ?? T('Former member');
  }
  _role(conv) {
    return conv.members.find((m) => m.userId === this.chat.me.id)?.role;
  }
  /**
   * A person's or group's picture. Shows their uploaded photo (or the one the
   * platform supplied); the coloured initials are only the fallback, and stay
   * visible until a picture has actually loaded.
   */
  _avatar(name, picture, { small = false, online = false } = {}) {
    const el = h('div', { class: `avatar${small ? ' sm' : ''}`, 'aria-hidden': 'true' });
    const letters = document.createTextNode(initials(name));
    el.append(letters);
    el.style.backgroundColor = `hsl(${hue(name)} 45% 45%)`;
    if (picture && this.chat) {
      this.chat.avatarUrl(picture).then((url) => {
        if (!url) return;
        el.style.backgroundImage = `url("${url}")`;
        el.classList.add('photo-on');
        letters.remove();
      });
    }
    if (online) el.append(h('span', { class: 'dot' }));
    return el;
  }
  _snippet(m) {
    if (m.deleted) return T('Message deleted');
    if (m.undecryptable) return T('Encrypted message');
    if (m.viewOnce) return T('View-once message');
    if (m.kind === 'poll') return T('Poll: {question}', { question: m.text });
    if (m.kind === 'location') return T('Shared a location');
    if (m.kind === 'call') return m.call.video ? T('Video call') : T('Voice call');
    // Previews show the words, not the *formatting* marks around them.
    const words = (m.text ?? '').replace(/(?<![\p{L}\p{N}])([*_~`])(?=\S)([^\n]*?\S)\1(?![\p{L}\p{N}])/gu, '$2');
    return words || (m.file ? this._fileLabel(m.file) : '');
  }
  _preview(conv, m) {
    if (!m) return conv.encrypted ? T('Encrypted conversation') : T('No messages yet');
    const who = m.kind === 'system' ? '' : m.senderId === this.chat.me.id ? T('You: ') : conv.type === 'group' ? `${first(this._memberName(conv, m.senderId))}: ` : '';
    return who + this._snippet(m);
  }

  // ---- conversation list, search, stories ----

  /** The lowest read position among the other members: everything up to it has been read by all. */
  _othersRead(conv) {
    const me = this.chat.me.id;
    return Math.min(...conv.members.filter((m) => m.userId !== me).map((m) => m.lastReadSeq), Infinity);
  }

  /** One tick for sent, two for read by everyone. */
  _ticks(read) {
    return h('span', { class: `ticks${read ? ' read' : ''}`, icon: read ? 'checks' : 'check', title: read ? T('Read') : T('Sent') });
  }

  /** What an attachment is called in previews: a voice message, a photo, or its file name. */
  _fileLabel(file) {
    if (/^voice-note/.test(file.name) && file.mime?.startsWith('audio/')) return `🎤 ${T('Voice message')}`;
    if (INLINE_IMAGES.has(file.mime)) return `📷 ${T('Photo')}`;
    return `📎 ${file.name}`;
  }

  /**
   * How a message's actions are reached without the hover buttons: press and
   * hold on a touch screen, right-click with a mouse, Enter or Space from the
   * keyboard. On a touch screen a message can also be swiped to reply and
   * double-tapped to like.
   */
  _pressable(bubble, row, m, mine, conv) {
    bubble.tabIndex = 0;
    this._holdable(bubble, (e) => {
      const more = row.querySelector('.acts .mini:last-child');
      const hoverUi = e.type === 'contextmenu' && more && getComputedStyle(more.parentElement).display !== 'none';
      if (hoverUi) this._pop(more, 'menu', m, mine, conv);
      else this._messageSheet(m, mine, conv);
    });
    bubble.addEventListener('keydown', (e) => {
      if (e.target === bubble && (e.key === 'Enter' || e.key === ' ')) (e.preventDefault(), this._messageSheet(m, mine, conv));
    });
    bubble.addEventListener('dblclick', (e) => {
      if (!e.target.closest('a, button, .wave')) this._toggleReaction(m, '❤️');
    });

    // Swipe towards the centre of the screen to reply.
    let from = null;
    let dx = 0;
    const settle = () => {
      row.style.transition = 'transform .15s';
      row.style.transform = '';
      from = null;
      dx = 0;
    };
    row.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' && !e.target.closest('.wave, button, a')) from = [e.clientX, e.clientY];
    });
    row.addEventListener('pointermove', (e) => {
      if (!from) return;
      const x = e.clientX - from[0];
      if (Math.abs(e.clientY - from[1]) > 24) return settle();
      dx = Math.max(0, Math.min(72, this._dir === 'rtl' ? -x : x));
      if (dx > 8) {
        row.style.transition = 'none';
        row.style.transform = `translateX(${this._dir === 'rtl' ? -dx : dx}px)`;
      }
    });
    row.addEventListener('pointerup', () => {
      if (dx > 52) (navigator.vibrate?.(8), this._setDraftMode({ replyTo: m }));
      settle();
    });
    row.addEventListener('pointercancel', settle);
  }

  /** Everything that can be done with a message, in the order people look for it. */
  _menuItems(m, mine, conv) {
    const role = this._role(conv);
    const canDelete = mine || (conv.type === 'group' && role !== 'member');
    const canPin = !(conv.announce && role === 'member');
    const plain = m.kind === 'text' && !m.viewOnce;
    return [
      { icon: 'reply', label: T('Reply'), run: () => this._setDraftMode({ replyTo: m }) },
      m.text && !m.viewOnce && { icon: 'copy', label: T('Copy text'), run: () => this._guard(navigator.clipboard.writeText(m.text).then(() => this._toast(T('Copied')))) },
      !m.viewOnce && m.kind !== 'call' && { icon: 'forward', label: T('Forward'), run: () => this._forwardDialog(m) },
      { icon: 'star', label: m.starred ? T('Unstar') : T('Star'), run: () => this._guard(m.starred ? this.chat.unstar(m.id) : this.chat.star(m.id)) },
      canPin && { icon: 'pin', label: m.pinned ? T('Unpin') : T('Pin'), run: () => this._guard(m.pinned ? this.chat.unpin(m.id) : this.chat.pin(m.id)) },
      mine && plain && { icon: 'edit', label: T('Edit'), run: () => this._setDraftMode({ editing: m }) },
      mine && conv.type === 'group' && { icon: 'info', label: T('Message info'), run: () => this._infoDialog(m, conv) },
      !mine && { icon: 'flag', label: T('Report'), run: () => this._reportDialog(m) },
      canDelete && { icon: 'trash', label: T('Delete'), danger: true, run: () => this._guard(this.chat.remove(m.id)) },
    ].filter(Boolean);
  }

  _quickReactions(m, done) {
    return [
      QUICK_REACTIONS.map((emoji) => h('button', { class: 'emoji', 'aria-label': T('React {emoji}', { emoji }), onclick: () => (done(), this._toggleReaction(m, emoji)) }, emoji)),
      h('button', { class: 'emoji', icon: 'plus', title: T('More reactions'), 'aria-label': T('More reactions'), onclick: () => {
        done();
        this._openDialog(h('div', { class: 'panel' }, this._dialogTitle(T('React')), this._emojiGrid((emoji) => (this.$dialog.close(), this._toggleReaction(m, emoji)))));
      } }),
    ];
  }

  /** Open the reaction strip or the action menu next to a message. */
  _pop(anchor, kind, m, mine, conv) {
    const again = this._popEl?.dataset.key === `${kind}:${m.id}`;
    this._closePop();
    if (again) return;
    const row = anchor.closest('.row');
    const pop = kind === 'reactions'
      ? h('div', { class: 'pop reactions', role: 'menu' }, this._quickReactions(m, () => this._closePop()))
      : h('div', { class: 'pop list', role: 'menu' }, this._menuItems(m, mine, conv).map((item) =>
        h('button', { role: 'menuitem', class: item.danger ? 'danger' : '', onclick: () => (this._closePop(), item.run()) }, h('span', { icon: item.icon }), item.label)));
    pop.dataset.key = `${kind}:${m.id}`;
    anchor.parentElement.append(pop);
    // Open towards whichever side of the message has room; if neither has
    // enough, take the larger side and let the menu scroll.
    const area = this.$msgs.getBoundingClientRect();
    const at = anchor.getBoundingClientRect();
    const above = at.top - area.top - 12;
    const below = area.bottom - at.bottom - 12;
    const need = pop.offsetHeight;
    const down = above < need && below > above;
    if (down) pop.classList.add('below');
    if ((down ? below : above) < need) {
      pop.style.maxHeight = `${Math.max(120, down ? below : above)}px`;
      pop.style.overflowY = 'auto';
    }
    row.classList.add('active');
    this._popEl = pop;
  }

  _closePop() {
    this._popEl?.closest('.row')?.classList.remove('active');
    this._popEl?.remove();
    this._popEl = null;
  }

  /** The same actions as a sheet: reactions across the top, the list beneath. */
  _messageSheet(m, mine, conv) {
    const close = () => this.$dialog.close();
    this._openDialog(h('div', { class: 'panel' },
      h('div', { class: 'quick' }, this._quickReactions(m, close)),
      h('div', { class: 'sheetlist', role: 'menu' }, this._menuItems(m, mine, conv).map((item) =>
        h('button', { role: 'menuitem', class: item.danger ? 'danger' : '', onclick: () => (close(), item.run()) }, h('span', { icon: item.icon }), item.label))),
    ));
  }

  /**
   * A voice note the way messengers show one: a round play button, the
   * recording's waveform (which doubles as the seek bar), its length, and a
   * speed switch. Other audio files get the same player with their name.
   * The node is kept per message, so a re-render does not interrupt playback.
   */
  _audio(m, fresh = false) {
    const kept = !fresh && this.players.get(m.id);
    if (kept) return kept.el;
    const BARS = 36;
    const voice = /^voice-note/.test(m.file.name);
    const bars = Array.from({ length: BARS }, (_, i) => {
      const bar = h('i');
      bar.style.height = `${30 + ((i * 37) % 45)}%`; // a placeholder shape until the audio is decoded
      return bar;
    });
    const $wave = h('div', { class: 'wave', role: 'slider', tabindex: '0', 'aria-label': T('Seek') }, bars);
    const $time = h('span', {}, '0:00');
    const $play = h('button', { class: 'vplay', icon: 'play', type: 'button', 'aria-label': T('Play') });
    const $speed = h('button', { class: 'vspeed', type: 'button', 'aria-label': T('Playback speed') }, '1×');
    const el = h('div', { class: 'voice' }, $play,
      h('div', { class: 'vbody' }, $wave, h('div', { class: 'vmeta' }, $time, !voice && h('span', { class: 'vname' }, m.file.name))), $speed);
    const audio = new Audio();
    let duration = 0;
    const paint = () => {
      const at = duration ? audio.currentTime / duration : 0;
      bars.forEach((bar, i) => bar.classList.toggle('on', i / BARS < at));
      $time.textContent = mmss((audio.paused && !audio.currentTime ? duration : audio.currentTime) * 1000);
      $wave.setAttribute('aria-valuenow', String(Math.round(at * 100)));
    };
    const icon = () => {
      $play.innerHTML = ICON[audio.paused ? 'play' : 'pause'];
      $play.setAttribute('aria-label', audio.paused ? T('Play') : T('Pause'));
    };
    const ready = this.chat.download(m).then(async (blob) => {
      audio.src = URL.createObjectURL(blob);
      try {
        // Decoding gives both the real length (recordings often lack it) and the waveform.
        this._audioCtx ??= new (globalThis.AudioContext ?? globalThis.webkitAudioContext)();
        const decoded = await this._audioCtx.decodeAudioData(await blob.arrayBuffer());
        duration = decoded.duration;
        const samples = decoded.getChannelData(0);
        const span = Math.max(1, Math.floor(samples.length / BARS));
        const peaks = bars.map((_, i) => {
          let peak = 0;
          for (let j = i * span; j < (i + 1) * span && j < samples.length; j += 24) peak = Math.max(peak, Math.abs(samples[j]));
          return peak;
        });
        const top = Math.max(...peaks, 0.01);
        bars.forEach((bar, i) => (bar.style.height = `${Math.max(14, Math.round((peaks[i] / top) * 100))}%`));
      } catch {
        audio.addEventListener('loadedmetadata', () => Number.isFinite(audio.duration) && ((duration = audio.duration), paint()));
      }
      paint();
    });
    ready.catch(() => {
      $play.disabled = true;
      $time.textContent = T('unavailable');
    });
    $play.onclick = async () => {
      await ready.catch(() => {});
      if (!audio.paused) return audio.pause();
      for (const other of this.players.values()) if (other.audio !== audio) other.audio.pause(); // one at a time
      audio.play().catch(() => {});
    };
    audio.onplay = audio.onpause = icon;
    audio.ontimeupdate = paint;
    audio.onended = () => {
      audio.currentTime = 0;
      icon();
      paint();
    };
    const seek = (fraction) => {
      if (!duration) return;
      audio.currentTime = Math.max(0, Math.min(0.999, fraction)) * duration;
      paint();
    };
    $wave.onclick = (e) => {
      const box = $wave.getBoundingClientRect();
      seek((e.clientX - box.left) / box.width);
    };
    $wave.onkeydown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') (e.preventDefault(), seek((audio.currentTime + (e.key === 'ArrowRight' ? 5 : -5)) / (duration || 1)));
    };
    $speed.onclick = () => {
      audio.playbackRate = { 1: 1.5, 1.5: 2, 2: 1 }[audio.playbackRate] ?? 1;
      $speed.textContent = `${audio.playbackRate}×`;
    };
    if (!fresh) this.players.set(m.id, { el, audio });
    return el;
  }

  /** What the round button does right now: send the recording, send the message, or start recording. */
  _primary() {
    if (this._rec) return this._stopRecording(false);
    if (this.$input.value.trim() || this.pendingFile) return this._submit();
    if (navigator.mediaDevices && globalThis.MediaRecorder) this._startRecording();
  }

  // ---- appearance: follow the device, or a choice the person made here ----

  _themeChoice() {
    try {
      const saved = localStorage.getItem('plugchat:theme');
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
      return 'system';
    }
  }

  /** Is the dark look showing right now? */
  _dark() {
    const set = this.getAttribute('theme');
    return set ? set === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /** 'light', 'dark', or 'system' to go back to whatever the host page or the device says. */
  _setTheme(choice, remember = true) {
    if (remember) {
      try {
        if (choice === 'system') localStorage.removeItem('plugchat:theme');
        else localStorage.setItem('plugchat:theme', choice);
      } catch {
        // no storage: the choice lasts until the page reloads
      }
    }
    const theme = choice === 'system' ? this._hostTheme : choice;
    if (theme) this.setAttribute('theme', theme);
    else this.removeAttribute('theme');
    const dark = this._dark();
    this.$theme.innerHTML = ICON[dark ? 'sun' : 'moon'];
    const label = dark ? T('Switch to light') : T('Switch to dark');
    this.$theme.title = label;
    this.$theme.setAttribute('aria-label', label);
    // Lets the page around the chat follow, if it wants to.
    this.dispatchEvent(new CustomEvent('plugchat:theme', { detail: { theme: dark ? 'dark' : 'light', choice } }));
  }

  /** Is the single-pane (phone) layout showing? */
  _narrow() {
    return this.$root.clientWidth <= 700;
  }

  /** Leave the open chat. On a phone this is also what the device's back button does. */
  _back() {
    if (this._pushed) history.back();
    else this._select(null);
  }

  /** A brief confirmation at the bottom of the chat: "Copied", "Saved"... */
  _toast(text) {
    clearTimeout(this._toastTimer);
    this.$toast.textContent = text;
    this.$toast.hidden = false;
    this._toastTimer = setTimeout(() => (this.$toast.hidden = true), 1800);
  }

  /** Call `open` when an element is pressed and held (touch) or right-clicked (mouse). */
  _holdable(el, open) {
    let timer = null;
    let start = null;
    const cancel = () => clearTimeout(timer);
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      start = [e.clientX, e.clientY];
      timer = setTimeout(() => {
        navigator.vibrate?.(8);
        el.dataset.held = '1'; // swallow the click that follows the release
        open(e);
      }, 450);
    });
    el.addEventListener('pointermove', (e) => start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 8 && cancel());
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(type, cancel);
    el.addEventListener('click', (e) => {
      if (el.dataset.held) (delete el.dataset.held, e.stopPropagation(), e.preventDefault());
    }, true);
    el.addEventListener('contextmenu', (e) => {
      if (e.target.closest('a')) return; // keep the browser's own menu for links
      e.preventDefault();
      cancel();
      open(e);
    });
  }

  /** Quick actions for a chat in the list: what a long press or right-click offers. */
  _chatSheet(conv) {
    const close = () => this.$dialog.close();
    const item = (icon, label, run) => h('button', { role: 'menuitem', onclick: () => (close(), this._guard(Promise.resolve(run()))) }, h('span', { icon }), label);
    this._openDialog(h('div', { class: 'panel' },
      h('div', { class: 'hero compact' }, this._avatar(this._title(conv), conv.type === 'dm' ? this._other(conv)?.avatar : conv.avatar), h('strong', {}, this._title(conv))),
      h('div', { class: 'sheetlist', role: 'menu' },
        item('pin', conv.pinned ? T('Unpin') : T('Pin to top'), () => this.chat.settings(conv.id, { pinned: !conv.pinned })),
        item('mute', conv.muted ? T('Unmute notifications') : T('Mute notifications'), () => this.chat.settings(conv.id, { muted: !conv.muted })),
        item('archive', conv.archived ? T('Unarchive') : T('Archive'), () => this.chat.settings(conv.id, { archived: !conv.archived })),
        conv.unread > 0 && item('checks', T('Mark as read'), () => this.chat.read(conv.id, conv.lastSeq).then(() => ((conv.unread = 0), this._renderList(), this._announceUnread()))),
        item('info', conv.type === 'group' ? T('Group info') : T('Contact info'), () => this._detailsDialog(conv)),
      ),
    ));
  }

  /** Let the person choose a photo, crop it to a centred square and shrink it for use as a picture. */
  _pickPicture() {
    return new Promise((resolve) => {
      const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return resolve(null);
        try {
          const bitmap = await createImageBitmap(file);
          const side = Math.min(bitmap.width, bitmap.height);
          const canvas = h('canvas', { width: '320', height: '320' });
          canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 320, 320);
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.86);
        } catch {
          this._error(T('That file is not a picture this browser can read.'));
          resolve(null);
        }
      };
      input.click();
    });
  }

  /** A whole screen rather than a small prompt: on a phone it fills the display and has a back arrow. */
  _openPage(...content) {
    this._openDialog(...content);
    this.$dialog.className = 'page';
  }

  _renderList() {
    if (!this.chat?.me) return;
    const q = this.query.trim().toLowerCase();
    const me = this.chat.me.id;
    const all = [...this.convs.values()];
    const archived = all.filter((c) => c.archived);
    const passes = (c) => (this.filter === 'unread' ? c.unread > 0 : this.filter === 'groups' ? c.type === 'group' : true);
    const shown = (q ? all.filter((c) => this._title(c).toLowerCase().includes(q)) : this.showArchived ? archived : all.filter((c) => !c.archived && passes(c)))
      .sort((a, b) => b.pinned - a.pinned || b.updatedAt - a.updatedAt);

    const chip = (key, label) => h('button', { class: 'chip', 'aria-pressed': String(this.filter === key), onclick: () => ((this.filter = key), this._renderList()) }, label);
    this.$chips.hidden = !!q || this.showArchived || all.length === 0;
    fill(this.$chips, chip('all', T('All')), chip('unread', T('Unread')), chip('groups', T('Groups')));

    const nodes = [];
    if (!q && this.showArchived) nodes.push(h('button', { class: 'linkrow', onclick: () => ((this.showArchived = false), this._renderList()) }, T('← Back to chats')));
    for (const c of shown) {
      const other = c.type === 'dm' ? this._other(c) : null;
      const title = this._title(c);
      const last = c.lastMessage;
      const unread = c.unread > 0 && c.id !== this.activeId;
      const typing = this.typing.get(c.id)?.size > 0;
      const draft = c.id !== this.activeId && this._draft(c.id);
      const mineLast = last && last.senderId === me && last.kind !== 'system' && !last.deleted;
      nodes.push(h('button', { class: `conv${unread ? ' unread' : ''}`, role: 'listitem', 'data-id': c.id, 'aria-current': String(c.id === this.activeId), onclick: () => this._select(c.id) },
        this._avatar(title, other ? other.avatar : c.avatar, { online: !!other && this.chat.online.has(other.userId) }),
        h('div', { class: 'body' },
          h('div', { class: 'line' },
            h('span', { class: 'name' }, title),
            last && h('span', { class: 'when' }, shortWhen(last.createdAt)),
          ),
          h('div', { class: 'line' },
            !typing && !draft && mineLast && this._ticks(last.seq <= this._othersRead(c)),
            typing ? h('span', { class: 'preview live' }, T('typing…'))
              : draft ? h('span', { class: 'preview draft' }, T('Draft: {text}', { text: draft }))
              : h('span', { class: 'preview' }, this._preview(c, last)),
            c.pinned && h('span', { icon: 'pin', title: T('Pinned') }),
            c.muted && h('span', { icon: 'mute', title: T('Muted') }),
            unread && h('span', { class: `badge${c.muted ? ' quiet' : ''}`, 'aria-label': T('{n} unread', { n: c.unread }) }, c.unread > 99 ? '99+' : String(c.unread)),
          ),
        ),
      ));
    }
    if (!q && !this.showArchived && archived.length) {
      nodes.push(h('button', { class: 'linkrow', onclick: () => ((this.showArchived = true), this._renderList()) }, T('Archived ({n})', { n: archived.length })));
    }
    if (q && this.hits.length) {
      nodes.push(h('div', { class: 'section' }, T('Messages')));
      for (const m of this.hits) {
        const c = this.convs.get(m.conversationId);
        if (!c) continue;
        nodes.push(h('button', { class: 'conv', onclick: () => this._select(c.id, m.id) },
          this._avatar(this._title(c), c.type === 'dm' ? this._other(c)?.avatar : c.avatar),
          h('div', { class: 'body' },
            h('div', { class: 'line' }, h('span', { class: 'name' }, this._title(c)), h('span', { class: 'when' }, shortWhen(m.createdAt))),
            h('div', { class: 'line' }, h('span', { class: 'preview' }, `${first(this._memberName(c, m.senderId))}: ${m.text}`)),
          )));
      }
    }
    if (!nodes.length) nodes.push(h('div', { class: 'hint' }, q ? T('Nothing found.') : this.filter !== 'all' ? T('Nothing here.') : T('No conversations yet. Press + to start one.')));
    fill(this.$list, ...nodes);
  }

  async _search() {
    const q = this.query.trim();
    if (q.length < 2) {
      this.hits = [];
      return this._renderList();
    }
    // The server cannot read encrypted chats, so those are searched here, over what this device has loaded.
    const local = [];
    for (const [id, state] of this.msgs) {
      if (!this.convs.get(id)?.encrypted) continue;
      local.push(...state.list.filter((m) => m.kind === 'text' && !m.deleted && m.text.toLowerCase().includes(q.toLowerCase())));
    }
    const remote = await this.chat.search(q).catch(() => []);
    if (q !== this.query.trim()) return;
    this.hits = [...local, ...remote].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
    this._renderList();
  }

  async _loadStories() {
    if (!this.chat?.me?.features?.stories || !this._on('stories')) return;
    this.feed = await this.chat.stories().catch(() => []);
    const me = this.chat.me;
    const mine = this.feed.find((g) => g.user.id === me.id);
    const ring = (group, label, unseen, onclick) =>
      h('button', { class: 'story', title: label, onclick }, h('span', { class: `ring${unseen ? ' new' : ''}` }, this._avatar(group.user.name, group.user.avatar)), h('span', {}, label));
    this.$stories.hidden = false;
    fill(this.$stories, 
      mine ? ring(mine, T('My story'), false, () => this._storyDialog(mine)) : ring({ user: me }, T('Add story'), false, () => this._newStoryDialog()),
      this.feed.filter((g) => g.user.id !== me.id).map((g) => ring(g, first(g.user.name), g.stories.some((s) => !s.seen), () => this._storyDialog(g))),
    );
  }

  // ---- thread ----

  async _openPeer() {
    const id = this.getAttribute('peer');
    const handle = this.getAttribute('peer-handle');
    if (!id && !handle) return;
    try {
      const options = { encrypted: !!this.chat.me.features?.requireEncryption };
      const conv = id ? await this.chat.openDm(id, options) : await this.chat.openDmByHandle(handle, options);
      this.convs.set(conv.id, conv);
      await this._select(conv.id);
    } catch (e) {
      this._error(e.message);
    }
  }

  /**
   * Encrypted chats: notice when a member has a device this one has not seen
   * before. New devices are how keys spread, so an unexpected one deserves a
   * look at the safety code. The first sighting of a conversation is trusted.
   */
  _renderDeviceNotice() {
    const conv = this.convs.get(this.activeId);
    if (!this.$notice) return;
    this.$notice.hidden = true;
    if (!conv?.encrypted) return;
    const slot = `plugchat:devices:${this.chat.me.id}:${conv.id}`;
    const now = Object.fromEntries(conv.members.map((m) => [m.userId, (m.devices ?? []).map((d) => d.publicKey).sort()]));
    const remember = () => {
      try {
        localStorage.setItem(slot, JSON.stringify(now));
      } catch {
        // without storage every visit is a first sighting
      }
    };
    let before = null;
    try {
      before = JSON.parse(localStorage.getItem(slot));
    } catch {
      // unreadable: treat as a first sighting
    }
    const changed = before
      ? conv.members.filter((m) => m.userId !== this.chat.me.id && before[m.userId] && now[m.userId].some((k) => !before[m.userId].includes(k)))
      : [];
    if (!changed.length) return remember();
    this.$notice.hidden = false;
    fill(this.$notice,
      h('span', { icon: 'lock' }),
      h('span', {}, T('{names} added a new device. If that is unexpected, compare the safety code before sharing anything sensitive.', { names: changed.map((m) => m.name).join(', ') })),
      h('button', { class: 'linkbtn', onclick: () => this._detailsDialog(conv) }, T('Safety code')),
      h('button', { class: 'linkbtn', onclick: () => (remember(), (this.$notice.hidden = true)) }, T('OK')));
  }

  // Unsent text is kept per conversation, across reloads, on this device only.
  _draftKey(id) {
    return `plugchat:draft:${this.chat.me.id}:${id}`;
  }
  _draft(id) {
    try {
      return localStorage.getItem(this._draftKey(id)) ?? '';
    } catch {
      return '';
    }
  }
  _saveDraft(id, text) {
    try {
      if (text.trim()) localStorage.setItem(this._draftKey(id), text);
      else localStorage.removeItem(this._draftKey(id));
    } catch {
      // storage unavailable (private window): drafts simply do not persist
    }
  }

  async _select(id, focusMessageId) {
    if (this.activeId && this.$input?.isConnected && !this.editing) this._saveDraft(this.activeId, this.$input.value);
    // On a phone, opening a chat is a step the device's back button can undo.
    if (id && !this._pushed && this._narrow() && this._on('history')) {
      history.pushState({ ...history.state, plugchat: true }, '');
      this._pushed = true;
    }
    if (!id) this._pushed = false;
    this.activeId = id;
    this._below = 0;
    this._mention = null;
    this.replyTo = this.editing = this.pendingFile = null;
    this.pendingMore = [];
    this.viewOnce = false;
    this.pins = [];
    this.opened.clear();
    this._stopRecording(true);
    for (const player of this.players.values()) player.audio.pause();
    this.players.clear();
    this.$root.classList.toggle('open', !!id);
    this._renderList();
    if (!id) return fill(this.$main, h('div', { class: 'hint' }, h('span', { icon: 'bubbles' }), T('Select a conversation to start chatting.')));

    this.$header = h('div', { class: 'bar' });
    this.$pins = h('button', { class: 'pinbar', hidden: true });
    this.$notice = h('div', { class: 'notice', hidden: true, role: 'status' });
    this.$msgs = h('div', { class: 'msgs', role: 'log' });
    // Screen readers hear each new message once, from here, instead of the whole thread being re-read.
    this.$live = h('div', { class: 'sr', 'aria-live': 'polite' });
    this.$typing = h('div', { class: 'typing' });
    this.$error = h('div', { class: 'error', hidden: true, role: 'alert' });
    this.$banner = h('div', { class: 'extras', hidden: true });
    this.$input = h('textarea', { rows: '1', placeholder: T('Message'), 'aria-label': T('Message'),
      oninput: () => (this._onInput(), this._mentionLookup()),
      onfocus: () => setTimeout(() => this.$msgs.scrollHeight - this.$msgs.scrollTop - this.$msgs.clientHeight < 400 && (this.$msgs.scrollTop = this.$msgs.scrollHeight), 300),
      onkeydown: (e) => {
        if (this._mention && this._mentionKey(e)) return;
        // Arrow-up in an empty box edits your last message, as people expect.
        if (e.key === 'ArrowUp' && !this.$input.value && !this.editing) {
          const last = this.msgs.get(this.activeId)?.list.findLast((m) => m.senderId === this.chat.me.id && m.kind === 'text' && !m.viewOnce && !m.pending && !m.deleted && !m.undecryptable);
          if (last) (e.preventDefault(), this._setDraftMode({ editing: last }));
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) (e.preventDefault(), this._submit());
        if (e.key === 'Escape') {
          for (const menu of [this.$menu, this.$emoji]) menu.hidden = true;
          this._setDraftMode(null);
        }
      },
      onpaste: (e) => {
        const files = [...(e.clipboardData?.files ?? [])];
        if (files.length) (e.preventDefault(), this._attach(files));
      },
    });
    this.$mentions = h('div', { class: 'menu', hidden: true, role: 'listbox', 'aria-label': T('Mention someone') });
    this.$emoji = h('div', { class: 'menu', hidden: true }, this._emojiGrid((emoji) => {
      const el = this.$input;
      const at = el.selectionStart;
      el.value = el.value.slice(0, at) + emoji + el.value.slice(el.selectionEnd);
      el.selectionStart = el.selectionEnd = at + emoji.length;
      this._onInput();
      el.focus();
    }));
    this.$toBottom = h('button', { class: 'tobottom', hidden: true, type: 'button', title: T('Jump to latest'), 'aria-label': T('Jump to latest'), onclick: () => this._toLatest() });
    this.$file = h('input', { type: 'file', hidden: true, multiple: true, onchange: () => {
      this._attach(this.$file.files);
      this.$file.value = '';
    } });
    this.$menu = h('div', { class: 'sheet', hidden: true, role: 'menu' });
    this.$rec = h('div', { class: 'rec' });
    this.$action = h('button', { class: 'action', type: 'submit', icon: 'mic' });
    this.$composer = h('form', { class: 'composer', onsubmit: (e) => (e.preventDefault(), this._primary()) },
      this.$file, this.$menu, this.$mentions, this.$toBottom, this.$emoji,
      h('div', { class: 'pill' },
        h('button', { class: 'icon', icon: 'smile', type: 'button', title: T('Emoji'), 'aria-label': T('Emoji'), onclick: () => (this.$emoji.hidden = !this.$emoji.hidden) }),
        this.$input,
        h('button', { class: 'icon attach', icon: 'clip', type: 'button', title: T('Attach'), 'aria-label': T('Attach'), 'aria-haspopup': 'menu', onclick: () => this._toggleMenu() }),
        // Straight to the phone's camera; hidden once there is text, to leave room for it.
        h('button', { class: 'icon cambtn', icon: 'camera', type: 'button', title: T('Camera'), 'aria-label': T('Camera'), onclick: () => this.$camera.click() }),
        (this.$camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: () => {
          this._attach(this.$camera.files);
          this.$camera.value = '';
        } }))),
      this.$rec, this.$action,
    );
    this.$readonly = h('div', { class: 'hint', hidden: true }, T('Only admins can post in this channel.'));
    fill(this.$main, this.$header, this.$pins, this.$notice, this.$live, this.$msgs, this.$typing, this.$error, this.$banner, this.$composer, this.$readonly);
    this._renderHeader();
    this._renderComposerState();
    this.chat.pins(id).then((p) => this.activeId === id && ((this.pins = p), this._renderPins()), () => {});
    this.$input.value = this._draft(id);
    this._onInput(true);
    this._renderDeviceNotice();

    // Dropping a file anywhere on the conversation attaches it.
    // Only file drags are taken over; text and link drags keep the browser's own behaviour.
    // (A handler assigned this way must not return false, or it would accept every drag.)
    this.$main.ondragover = (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      this.$main.classList.add('drop');
    };
    this.$main.ondragleave = () => this.$main.classList.remove('drop');
    this.$main.ondrop = (e) => {
      this.$main.classList.remove('drop');
      const files = e.dataTransfer?.files;
      if (files?.length) (e.preventDefault(), this._attach(files));
    };
    this.$msgs.onscroll = () => this._onScroll();

    // Where this person left off, so new messages can be marked as such.
    const conv = this.convs.get(id);
    const unreadFrom = conv.unread > 0 ? conv.lastSeq - conv.unread : null;
    const peer = conv.type === 'dm' ? this._other(conv) : null;
    if (peer && !this.chat.online.has(peer.userId)) {
      this.chat.user(peer.userId).then((u) => u.lastSeen && (this.lastSeen.set(u.id, u.lastSeen), this._renderHeader()), () => {});
    }

    if (!this.msgs.has(id)) {
      fill(this.$msgs, h('div', { class: 'hint' }, T('Loading…')));
      try {
        const list = await this.chat.messages(id);
        this.msgs.set(id, { list, more: list.length === 50, moreAfter: false, unreadFrom });
      } catch (e) {
        if (this.activeId === id) fill(this.$msgs, h('div', { class: 'hint' }, T('Could not load messages: {reason}', { reason: e.message })));
        return;
      }
      if (this.activeId !== id) return;
    }
    this._renderMessages({ stick: true, instant: true });
    this._markRead();
    if (focusMessageId) this._jumpTo(focusMessageId);
    else this.$input.focus({ preventScroll: true });
  }

  _renderComposerState() {
    const conv = this.convs.get(this.activeId);
    if (!conv || !this.$composer) return;
    const suspended = this.chat.me.suspended;
    const readonly = !!suspended || (conv.announce && this._role(conv) === 'member');
    this.$composer.hidden = readonly;
    this.$readonly.hidden = !readonly;
    // A suspended person can read but not write; say why, in the host's words.
    this.$readonly.textContent = suspended || T('Only admins can post in this channel.');
  }

  _renderHeader() {
    const conv = this.convs.get(this.activeId);
    if (!conv || !this.$header) return;
    const other = conv.type === 'dm' ? this._other(conv) : null;
    const seen = other && this.lastSeen.get(other.userId);
    const typists = [...(this.typing.get(conv.id)?.keys() ?? [])];
    // The host's own call vendor handles groups too; built-in peer-to-peer calls are one-to-one.
    const canCall = this._on('calls') && (this._external() || (other && this.calls));
    const status = typists.length
      ? (conv.type === 'group' ? T('{name} is typing…', { name: first(this._memberName(conv, typists[0])) }) : T('typing…'))
      : other ? (this.chat.online.has(other.userId) ? T('Online') : seen ? T('Last seen {when}', { when: shortWhen(seen) }) : T('Offline'))
      : T('{n} members', { n: conv.members.length }) + (conv.announce ? T(' · announcements') : '');
    fill(this.$header,
      h('button', { class: 'icon backbtn', icon: 'back', title: T('Back'), 'aria-label': T('Back to conversations'), onclick: () => this._back() }),
      // The name and picture open the conversation's details, as people expect.
      h('button', { class: 'who', 'aria-label': T('Conversation details'), onclick: () => this._detailsDialog(conv) },
        this._avatar(this._title(conv), other ? other.avatar : conv.avatar, { online: !!other && this.chat.online.has(other.userId) }),
        h('div', { class: 'title' },
          h('span', { class: 'name' }, this._title(conv)),
          h('div', { class: `sub${typists.length ? ' live' : ''}` },
            conv.encrypted && h('span', { icon: 'lock', title: T('End-to-end encrypted') }),
            conv.ttlSeconds && h('span', { icon: 'timer', title: T('Disappearing messages are on') }),
            h('span', {}, status),
          ),
        )),
      canCall && h('button', { class: 'icon', icon: 'video', title: T('Video call'), 'aria-label': T('Video call'), onclick: () => this._call(conv, other, true) }),
      canCall && h('button', { class: 'icon', icon: 'phone', title: T('Voice call'), 'aria-label': T('Voice call'), onclick: () => this._call(conv, other, false) }),
      h('button', { class: 'icon', icon: 'more', title: T('Conversation details'), 'aria-label': T('Conversation details'), onclick: () => this._detailsDialog(conv) }),
    );
    // On a phone the list is out of sight, so the back arrow carries the count of what is waiting there.
    const waiting = [...this.convs.values()].reduce((n, c) => n + (c.id !== conv.id && !c.muted ? c.unread : 0), 0);
    if (waiting) this.$header.querySelector('.backbtn').append(h('span', { class: 'badge' }, waiting > 99 ? '99+' : String(waiting)));
  }

  _renderPins() {
    if (!this.$pins) return;
    const top = this.pins[0];
    this.$pins.hidden = !top;
    if (!top) return;
    fill(this.$pins, h('span', { icon: 'pin' }), h('span', {}, this._snippet(top)), this.pins.length > 1 && h('small', {}, `+${this.pins.length - 1}`));
    this.$pins.onclick = () => this._jumpTo(top.id);
  }

  /** Scroll to a message, loading the stretch of history around it if it is not on screen. */
  async _jumpTo(messageId) {
    const find = () => this.$msgs?.querySelector(`[data-id="${CSS.escape(messageId)}"]`);
    let row = find();
    if (!row) {
      const id = this.activeId;
      try {
        const target = await this.chat.message(messageId);
        if (target.conversationId !== id) return;
        const list = await this.chat.messages(id, { around: target.seq });
        if (this.activeId !== id) return;
        this.msgs.set(id, { list, more: (list[0]?.seq ?? 1) > 1, moreAfter: (list.at(-1)?.seq ?? 0) < this.convs.get(id).lastSeq });
        this._renderMessages();
        row = find();
      } catch (e) {
        return this._error(e.message);
      }
    }
    if (!row) return;
    row.scrollIntoView({ block: 'center' });
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 1600);
  }

  async _loadNewer() {
    const id = this.activeId;
    const state = this.msgs.get(id);
    if (!state?.list.length) return;
    const newer = await this.chat.messages(id, { after: state.list.at(-1).seq });
    state.list = [...state.list, ...newer];
    state.moreAfter = newer.length === 50;
    if (this.activeId === id) this._renderMessages();
  }
  _renderTyping() {
    // Typing shows in three places at once: the chat list, the header, and as a bubble in the thread.
    this._renderList();
    const conv = this.convs.get(this.activeId);
    if (!conv || !this.$typing) return;
    this._renderHeader();
    const names = [...(this.typing.get(conv.id)?.keys() ?? [])].map((id) => first(this._memberName(conv, id)));
    fill(this.$typing, names.length > 0 && [
      h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      conv.type === 'group' && h('span', {}, names.join(', ')),
    ]);
    if (names.length && this.$msgs.scrollHeight - this.$msgs.scrollTop - this.$msgs.clientHeight < 120) this.$msgs.scrollTop = this.$msgs.scrollHeight;
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
    this._closePop();
    mentionable = new Set(conv.members.map((x) => first(x.name).toLowerCase()));
    const box = this.$msgs;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const me = this.chat.me.id;
    const byId = new Map(state.list.map((m) => [m.id, m]));
    const othersRead = this._othersRead(conv);
    const sameDay = (a, b) => new Date(a.createdAt).toDateString() === new Date(b.createdAt).toDateString();
    // Messages from one person within five minutes of each other form a block.
    const joins = (a, b) => a && b && a.kind !== 'system' && b.kind !== 'system' && a.senderId === b.senderId && sameDay(a, b) && b.createdAt - a.createdAt <= 5 * 60_000;

    const nodes = [];
    if (state.more) nodes.push(h('button', { class: 'more', onclick: () => this._guard(this._loadOlder()) }, T('Load earlier messages')));
    if (!state.list.length) nodes.push(h('div', { class: 'hint' }, conv.encrypted ? T('Messages here are end-to-end encrypted. Say hello.') : T('No messages yet. Say hello.')));

    let divided = false;
    state.list.forEach((m, index) => {
      const prev = state.list[index - 1];
      const next = state.list[index + 1];
      if (!prev || !sameDay(prev, m)) nodes.push(h('div', { class: 'day' }, dayLabel(m.createdAt)));
      // A line where this person stopped reading last time.
      if (state.unreadFrom != null && !divided && m.seq > state.unreadFrom && m.senderId !== me) {
        divided = true;
        nodes.push(h('div', { class: 'newline', role: 'separator' }, T('New messages')));
      }
      if (m.kind === 'system') return void nodes.push(h('div', { class: 'sys' }, m.text));

      const mine = m.senderId === me;
      const isFirst = !joins(prev, m);
      const isLast = !joins(m, next);
      const showAvatars = conv.type === 'group' && !mine;
      const name = this._memberName(conv, m.senderId);

      let bubble;
      if (m.deleted) bubble = h('div', { class: 'bubble ghost' }, T('Message deleted'));
      else if (m.undecryptable) bubble = h('div', { class: 'bubble ghost' }, T('Waiting for this device to receive the key for this message.'));
      else {
        const parent = m.replyTo && byId.get(m.replyTo);
        const shown = m.viewOnce ? this.opened.get(m.id) : m;
        // A photo on its own fills the bubble edge to edge, with the time laid over it.
        const photoOnly = shown?.file && INLINE_IMAGES.has(shown.file.mime) && !shown.text && !m.replyTo && !m.forwarded && !(showAvatars && isFirst);
        const jumbo = m.kind === 'text' && !m.file && !m.replyTo && !m.viewOnce && !m.forwarded && JUMBO.test(m.text ?? '');
        bubble = h('div', { class: `bubble${m.mentions?.includes(me) ? ' mention' : ''}${photoOnly ? ' media' : ''}${jumbo ? ' jumbo' : ''}${m.pending ? ' pending' : ''}` },
          showAvatars && isFirst && h('button', { class: 'sender', onclick: () => this._profileDialog(m.senderId) }, name),
          m.forwarded && h('div', { class: 'tag' }, h('span', { icon: 'forward' }), T('Forwarded')),
          m.replyTo && h('button', { class: 'quote', onclick: () => this._jumpTo(m.replyTo) }, parent ? `${this._memberName(conv, parent.senderId)}: ${this._snippet(parent)}` : T('Earlier message')),
          this._content(m, conv, mine),
          h('span', { class: 'meta' },
            m.starred && h('span', { icon: 'star', title: T('Starred') }),
            m.pinned && h('span', { icon: 'pin', title: T('Pinned') }),
            m.expiresAt && h('span', { icon: 'timer', title: T('Disappearing message') }),
            m.editedAt && T('edited ·'),
            clock(m.createdAt),
            m.pending && !m.failed && h('span', { icon: 'clock', title: T('Sending…') }),
            mine && !m.pending && this._ticks(m.seq <= othersRead),
          ),
        );
      }

      const reacts = Object.entries(m.reactions ?? {});
      const usable = !m.deleted && !m.undecryptable && !m.pending;
      const row = h('div', { class: `row${mine ? ' mine' : ''}${isFirst ? ' first' : ''}${isLast ? ' last' : ''}${state.shown && !state.shown.has(m.id) ? ' new' : ''}`, 'data-id': m.id },
        showAvatars && (isLast ? this._avatar(name, conv.members.find((x) => x.userId === m.senderId)?.avatar, { small: true }) : h('div', { class: 'spacer' })),
        h('div', { class: 'col' },
          bubble,
          reacts.length > 0 && h('div', { class: 'reacts' }, reacts.map(([emoji, users]) =>
            h('button', {
              class: `react${users.includes(me) ? ' on' : ''}`,
              title: users.map((u) => this._memberName(conv, u)).join(', '),
              onclick: () => this._toggleReaction(m, emoji),
            }, users.length > 1 ? `${emoji} ${users.length}` : emoji))),
          m.failed && h('div', { class: 'failed', role: 'alert' }, `${T('Not sent')} · ${m.failed} `,
            h('button', { class: 'linkbtn', onclick: () => this._deliver(m.conversationId, m.content, m.id) }, T('Retry')),
            h('button', { class: 'linkbtn', onclick: () => ((state.list = state.list.filter((x) => x.id !== m.id)), this._renderMessages()) }, T('Discard'))),
        ),
        usable && this._actions(m, mine, conv),
      );
      if (usable) this._pressable(bubble, row, m, mine, conv);
      nodes.push(row);
    });

    // Only messages that were not on screen last time animate in.
    state.shown = new Set(state.list.map((m) => m.id));
    if (state.moreAfter) {
      nodes.push(h('button', { class: 'more', onclick: () => this._guard(this._loadNewer()) }, T('Load newer messages')));
      nodes.push(h('button', { class: 'more', onclick: () => (this.msgs.delete(this.activeId), this._select(this.activeId)) }, T('Jump to latest')));
    }
    const keep = box.scrollHeight - box.scrollTop;
    fill(box, ...nodes);
    if (stick) {
      if (nearBottom || instant) box.scrollTop = box.scrollHeight;
    } else {
      box.scrollTop = nearBottom ? box.scrollHeight : box.scrollHeight - keep;
    }
    this._onScroll();
  }

  /** Send what is in the message box at a later time, and manage what is already waiting. */
  async _scheduleDialog() {
    const id = this.activeId;
    const text = this.$input.value.trim();
    const waiting = (await this.chat.scheduled().catch(() => [])).filter((s) => s.conversationId === id);
    const local = (t) => new Date(t - new Date(t).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    const $when = h('input', { type: 'datetime-local', 'aria-label': T('When'), value: local(Date.now() + 3600_000), min: local(Date.now() + 60_000) });
    const $err = h('div', { class: 'error', hidden: true, role: 'alert' });
    const fail = (e) => (($err.textContent = e.message), ($err.hidden = false));
    this._openDialog(h('div', { class: 'panel' },
      this._dialogTitle(T('Send later')),
      text
        ? [h('div', { class: 'storyview' }, text), h('label', { class: 'field' }, T('When'), $when),
          h('button', { class: 'btn', onclick: () => this.chat.schedule(id, { text }, new Date($when.value)).then(() => {
            this.$input.value = '';
            this._saveDraft(id, '');
            this._onInput(true);
            this._scheduleDialog();
          }, fail) }, T('Schedule'))]
        : h('div', { class: 'hint' }, T('Type a message first, then choose Send later.')),
      $err,
      waiting.length > 0 && h('div', { class: 'people' }, waiting.map((s) => h('div', { class: 'person' },
        h('span', {}, s.text),
        h('small', {}, s.error ? T('Could not be sent: {reason}', { reason: s.error }) : T('Scheduled for {when}', { when: new Date(s.sendAt).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }) })),
        h('button', { class: 'linkbtn', onclick: (e) => this.chat.cancelScheduled(s.id).then(() => e.target.closest('.person').remove(), fail) }, T('Remove'))))),
    ));
  }

  /** Everything that was shared in a conversation: photos, voice notes, files. */
  async _mediaDialog(conv) {
    const list = (await this.chat.attachments(conv.id).catch(() => [])).filter((m) => m.file && !m.undecryptable);
    this._openPage(h('div', { class: 'panel' },
      this._dialogTitle(T('Media and files')),
      list.length === 0 && h('div', { class: 'hint' }, T('Nothing has been shared here yet.')),
      h('div', { class: 'media' }, list.map((m) => h('div', { class: 'item' },
        this._attachment(m, true),
        h('button', { class: 'linkbtn', onclick: () => (this.$dialog.close(), this._jumpTo(m.id)) },
          `${first(this._memberName(conv, m.senderId))} · ${shortWhen(m.createdAt)}`)))),
    ));
  }

  /** A person's card: who they are, whether they are around, and what you can do. */
  async _profileDialog(userId) {
    if (userId === this.chat.me.id) return this._settingsDialog();
    let user;
    try {
      user = await this.chat.user(userId);
    } catch (e) {
      return this._error(e.message);
    }
    const blocked = (await this.chat.blocked().catch(() => [])).includes(userId);
    const $err = h('div', { class: 'error', hidden: true, role: 'alert' });
    const run = (p) => p.then(() => this.$dialog.close(), (e) => (($err.textContent = e.message), ($err.hidden = false)));
    this._openPage(h('div', { class: 'panel' },
      this._dialogTitle(T('Profile')),
      h('div', { class: 'hero' },
        this._avatar(user.name, user.avatar, { online: user.online }),
        h('strong', {}, user.name),
        user.about && h('small', { class: 'about' }, user.about),
        h('small', {}, user.online ? T('Online') : user.lastSeen ? T('Last seen {when}', { when: shortWhen(user.lastSeen) }) : T('Offline')),
        // Shown only when the platform chose to make identifiers visible.
        Object.values(user.handles ?? {}).map((value) => h('small', {}, value))),
      $err,
      h('button', { class: 'btn', onclick: () => run(this.chat.openDm(userId, { encrypted: !!this.chat.me.features?.requireEncryption }).then((conv) => {
        this.convs.set(conv.id, conv);
        return this._select(conv.id);
      })) }, T('Send a message')),
      h('button', { class: 'btn warn', onclick: () => run(blocked ? this.chat.unblock(userId) : this.chat.block(userId)) },
        blocked ? T('Unblock {name}', { name: user.name }) : T('Block {name}', { name: user.name })),
    ));
  }

  /** Emoji by category, with the ones this person uses most recently first. */
  _emojiGrid(onPick) {
    const recent = () => {
      try {
        return JSON.parse(localStorage.getItem('plugchat:emoji') ?? '[]').filter((e) => typeof e === 'string').slice(0, 16);
      } catch {
        return [];
      }
    };
    const remember = (emoji) => {
      try {
        localStorage.setItem('plugchat:emoji', JSON.stringify([emoji, ...recent().filter((e) => e !== emoji)].slice(0, 16)));
      } catch {
        // no storage: nothing to remember
      }
    };
    const $grid = h('div', { class: 'emojis', role: 'listbox', 'aria-label': T('Emoji') });
    const show = (key) => {
      const list = key === 'recent' ? recent() : EMOJI_SETS[key];
      fill($grid, list.length ? list.map((emoji) => h('button', { type: 'button', class: 'emoji', role: 'option', 'aria-label': emoji, onclick: () => (remember(emoji), onPick(emoji)) }, emoji))
        : h('div', { class: 'hint' }, T('The emoji you use will appear here.')));
      for (const tab of $tabs.children) tab.setAttribute('aria-pressed', String(tab.dataset.key === key));
    };
    const $tabs = h('div', { class: 'emojitabs' }, [['recent', '🕘'], ...Object.keys(EMOJI_SETS).map((key) => [key, EMOJI_SETS[key][0]])].map(([key, face]) => {
      const tab = h('button', { type: 'button', class: 'emoji', 'aria-label': key, onclick: () => show(key) }, face);
      tab.dataset.key = key;
      return tab;
    }));
    show(recent().length ? 'recent' : 'smileys');
    return h('div', { class: 'emojipicker' }, $tabs, $grid);
  }

  /** Who in a group has read one of your messages. */
  _infoDialog(m, conv) {
    const others = conv.members.filter((x) => x.userId !== this.chat.me.id);
    const group = (label, list) => list.length > 0 && h('div', { class: 'field' }, label,
      h('div', { class: 'people' }, list.map((x) => h('div', { class: 'person' }, this._avatar(x.name, x.avatar, { small: true }), h('span', {}, x.name)))));
    this._openDialog(h('div', { class: 'panel' },
      this._dialogTitle(T('Message info')),
      h('div', { class: 'storyview' }, this._snippet(m)),
      group(T('Read by'), others.filter((x) => x.lastReadSeq >= m.seq)),
      group(T('Not read yet'), others.filter((x) => x.lastReadSeq < m.seq)),
    ));
  }

  /** Save the whole conversation as a text file, decrypted on this device. */
  async _exportChat(conv, button) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = T('Exporting…');
    try {
      let all = [];
      let before;
      for (let page = 0; page < 50; page++) {
        const batch = await this.chat.messages(conv.id, { before, limit: 200 });
        all = [...batch, ...all];
        if (batch.length < 200) break;
        before = batch[0].seq;
      }
      const stamp = (t) => new Date(t).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' });
      const lines = all.map((m) => `[${stamp(m.createdAt)}] ${m.kind === 'system' ? '*' : this._memberName(conv, m.senderId)}: ${this._snippet(m)}`);
      const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
      h('a', { href: url, download: `${this._title(conv).replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'chat'}.txt` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  /** A photo, full size. */
  _lightbox(url, name) {
    this._openDialog(h('div', { class: 'panel' }, this._dialogTitle(name), h('img', { class: 'full', src: url, alt: name })));
  }

  /** A system notification for a message that arrived while this tab was not being looked at. */
  _notify(m) {
    const conv = this.convs.get(m.conversationId);
    const wanted = this._notifyOn() && globalThis.Notification?.permission === 'granted';
    const looking = document.visibilityState === 'visible' && m.conversationId === this.activeId && this.getClientRects().length;
    if (!wanted || looking || !conv || (conv.muted && !m.mentions?.includes(this.chat.me.id))) return;
    // Laid out like a messenger: who it is from on top, what they said underneath,
    // their picture beside it. In a group the group's name follows the sender's.
    const sender = conv.members.find((x) => x.userId === m.senderId);
    const from = m.kind === 'system' ? this._title(conv) : sender?.name ?? this._title(conv);
    const title = conv.type === 'group' && m.kind !== 'system' ? `${from} · ${conv.title}` : from;
    const body = this._previewsOn() ? this._snippet(m) : T('New message');
    const note = new Notification(title, {
      body,
      tag: conv.id, // one notification per conversation: a newer message replaces the older one
      renotify: true,
      icon: this.getAttribute('notification-icon') || this._notifyIcon(from, sender?.avatar),
    });
    note.onclick = () => {
      window.focus();
      this._select(conv.id);
      note.close();
    };
  }

  /** The sender's picture, or their initials on their colour, as a notification icon. */
  _notifyIcon(name, avatar) {
    if (avatar && /^https:\/\//.test(avatar)) return avatar;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `hsl(${hue(name)} 45% 45%)`;
    ctx.beginPath();
    ctx.arc(64, 64, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '600 52px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(name), 64, 68);
    return canvas.toDataURL('image/png');
  }

  /** Whether notifications may show what the message says (on unless the person turned it off). */
  _previewsOn() {
    try {
      return localStorage.getItem('plugchat:notify-preview') !== 'off';
    } catch {
      return true;
    }
  }

  _notifyOn() {
    try {
      return localStorage.getItem('plugchat:notify') === 'on';
    } catch {
      return false;
    }
  }

  /** The body of a bubble, by message kind. */
  _content(m, conv, mine) {
    if (m.viewOnce) {
      const shown = this.opened.get(m.id);
      if (shown) return [shown.file && this._attachment(shown), linkify(shown.text)];
      const recipients = conv.members.length - 1;
      if (mine) return h('div', { class: 'once' }, h('span', { icon: 'eye' }), T('View once · opened by {n} of {total}', { n: m.openedBy.length, total: recipients }));
      if (m.consumed || m.openedBy.includes(this.chat.me.id)) return h('div', { class: 'once' }, h('span', { icon: 'eye' }), T('Opened'));
      return h('button', { class: 'once', onclick: async () => {
        try {
          this.opened.set(m.id, await this.chat.open(m.id));
          this._renderMessages();
        } catch (e) {
          this._error(e.message);
        }
      } }, h('span', { icon: 'eye' }), m.hasFile ? T('Tap to view photo or file') : T('Tap to view message'));
    }
    if (m.kind === 'poll') return this._poll(m);
    if (m.kind === 'call') {
      return h('div', { class: 'once' }, h('span', { icon: m.call.video ? 'video' : 'phone' }), m.call.video ? T('Video call') : T('Voice call'),
        h('button', { class: 'btn plain', onclick: () => this._openCall(m.call.callId, conv) }, T('Join')));
    }
    if (m.kind === 'custom') {
      // The host decides how its own message types look; without a renderer the fallback text shows.
      const render = this.renderers?.[m.custom.type];
      if (render) {
        try {
          return render(m);
        } catch (e) {
          console.error('plugchat renderer failed', e);
        }
      }
      return linkify(m.text || `[${m.custom.type}]`);
    }
    if (m.kind === 'location') {
      const { lat, lng, label } = m.location;
      const url = `https://www.openstreetmap.org/?mlat=${Number(lat)}&mlon=${Number(lng)}#map=16/${Number(lat)}/${Number(lng)}`;
      return h('a', { class: 'file', href: url, target: '_blank', rel: 'noopener noreferrer' }, h('span', { icon: 'map' }), label || `${T('Location')} (${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)})`);
    }
    return [m.file && this._attachment(m), linkify(m.text), this._linkCard(m, conv)];
  }

  /**
   * A title-and-description card for the first link in a message. Never in
   * encrypted conversations: asking for a preview would tell the server the link.
   */
  _linkCard(m, conv) {
    if (conv.encrypted || m.kind !== 'text' || !this.chat.me.features?.linkPreviews) return null;
    const url = /https?:\/\/[^\s<>"']+/.exec(m.text ?? '')?.[0];
    if (!url) return null;
    this.cards ??= new Map();
    let pending = this.cards.get(url);
    if (!pending) this.cards.set(url, (pending = this.chat.preview(url).catch(() => null)));
    const card = h('a', { class: 'card', href: url, target: '_blank', rel: 'noopener noreferrer nofollow', hidden: true });
    pending.then((p) => {
      if (!p) return;
      card.hidden = false;
      fill(card, p.siteName && h('small', {}, p.siteName), h('strong', {}, p.title), p.description && h('span', {}, p.description));
    });
    return card;
  }

  _poll(m) {
    const me = this.chat.me.id;
    const votes = m.votes ?? {};
    const total = Object.values(votes).reduce((n, v) => n + v.length, 0);
    const mine = Object.keys(votes).filter((i) => votes[i].includes(me)).map(Number);
    return h('div', { class: 'poll' },
      h('div', { class: 'q' }, m.poll.question),
      m.poll.options.map((label, i) => {
        const count = votes[i]?.length ?? 0;
        const on = mine.includes(i);
        const fillBar = h('span', { class: 'fill' });
        fillBar.style.width = `${total ? Math.round((count / total) * 100) : 0}%`;
        return h('button', { class: `opt${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: () => {
          const picks = m.poll.multi ? (on ? mine.filter((x) => x !== i) : [...mine, i]) : on ? [] : [i];
          this._guard(this.chat.vote(m.id, picks));
        } }, h('span', { class: 'radio' }), h('span', { class: 'lbl' }, label), h('span', { class: 'cnt' }, String(count)), h('span', { class: 'track' }, fillBar));
      }),
      h('small', {}, `${m.poll.multi ? T('Choose any') : T('Choose one')} · ${total === 1 ? T('1 vote') : T('{n} votes', { n: total })}`),
    );
  }

  /** The two quiet buttons that appear beside a message under the mouse. */
  _actions(m, mine, conv) {
    const button = (icon, label, kind) => h('button', { class: 'mini', icon, title: label, 'aria-label': label, 'aria-haspopup': 'menu', onclick: (e) => this._pop(e.currentTarget, kind, m, mine, conv) });
    return h('div', { class: 'acts' }, button('smile', T('React'), 'reactions'), button('chevron', T('More'), 'menu'));
  }

  /** A photo, a video, a voice note or audio player, or a file card. `fresh` builds a separate copy (for the media view). */
  _attachment(m, fresh = false) {
    const label = `${m.file.name} (${size(m.file.size)})`;
    const blobUrl = () => {
      let url = this.blobs.get(m.file.fileId);
      if (!url) this.blobs.set(m.file.fileId, (url = this.chat.download(m).then((b) => URL.createObjectURL(b))));
      return url;
    };
    const small = m.file.size <= 8 * 1048576;
    if (INLINE_IMAGES.has(m.file.mime) && small) {
      const img = h('img', { class: 'pic', alt: m.file.name, title: label, onclick: () => img.src && this._lightbox(img.src, m.file.name) });
      blobUrl().then((u) => (img.src = u), () => (img.alt = T('Image unavailable')));
      return img;
    }
    if (PLAYABLE.test(m.file.mime) && small) {
      if (m.file.mime.startsWith('audio/')) return this._audio(m, fresh);
      const video = h('video', { class: 'media', controls: true, preload: 'metadata', playsinline: true, title: label });
      blobUrl().then((u) => (video.src = u), () => {});
      return video;
    }
    const save = async () => {
      const url = URL.createObjectURL(await this.chat.download(m));
      h('a', { href: url, download: m.file.name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    };
    return h('button', { class: 'filecard', title: T('Download'), onclick: () => this._guard(save()) },
      h('span', { class: 'ext', icon: 'file' }),
      h('span', { class: 'info' }, h('b', {}, m.file.name), h('small', {}, size(m.file.size))),
      h('span', { icon: 'download' }));
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
    // Not read until it is actually on screen (the tab is visible and the chat is not tucked inside a closed launcher).
    if (!conv || document.visibilityState !== 'visible' || !this.getClientRects().length || conv.unread === 0) return;
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

  _onInput(restoring = false) {
    const el = this.$input;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    // The main button is a microphone until there is something to send.
    const canRecord = !!(navigator.mediaDevices && globalThis.MediaRecorder);
    const sending = !!this._rec || !!el.value.trim() || !!this.pendingFile || !canRecord;
    this.$action.innerHTML = ICON[sending ? 'send' : 'mic'];
    this.$action.disabled = sending && !this._rec && !el.value.trim() && !this.pendingFile;
    this.$composer.classList.toggle('typing', !!el.value.trim());
    const label = this._rec ? T('Send voice message') : sending ? T('Send') : T('Record a voice note');
    this.$action.title = label;
    this.$action.setAttribute('aria-label', label);
    const t = Date.now();
    if (!restoring && el.value && t - (this._typedAt ?? 0) > 2000) {
      this._typedAt = t;
      this.chat.typing(this.activeId);
    }
  }

  /** Queue one or several files (up to 10) to go out with the next send, one message each. */
  _attach(files) {
    const added = files instanceof File ? [files] : [...(files ?? [])];
    // The + in the tray adds to what is already there; a fresh pick, drop or paste replaces it.
    const list = (this._appending ? [this.pendingFile, ...(this.pendingMore ?? []), ...added].filter(Boolean) : added).slice(0, 10);
    this._appending = false;
    this.pendingFile = list[0] ?? null;
    this.pendingMore = list.slice(1);
    this._renderBanner();
    this._onInput(true);
    this.$input.focus();
  }

  // ---- @-mentions: typing "@" in a group offers its members ----

  _mentionLookup() {
    const conv = this.convs.get(this.activeId);
    const el = this.$input;
    const typed = /(^|\s)@([^\s@]*)$/.exec(el.value.slice(0, el.selectionStart));
    if (!typed || conv?.type !== 'group') return this._closeMentions();
    const q = typed[2].toLowerCase();
    const items = conv.members.filter((m) => m.userId !== this.chat.me.id && m.name.toLowerCase().split(/\s+/).some((part) => part.startsWith(q))).slice(0, 6);
    if (!items.length) return this._closeMentions();
    this._mention = { start: el.selectionStart - typed[2].length - 1, items, index: 0 };
    this._renderMentions();
  }

  _renderMentions() {
    const { items, index } = this._mention;
    this.$mentions.hidden = false;
    fill(this.$mentions, items.map((m, i) =>
      h('button', { type: 'button', role: 'option', 'aria-selected': String(i === index), class: i === index ? 'sel' : '', onclick: () => this._pickMention(m) },
        this._avatar(m.name, m.avatar, { small: true }), m.name)));
  }

  _closeMentions() {
    this._mention = null;
    if (this.$mentions) this.$mentions.hidden = true;
  }

  /** Arrow keys, Enter and Tab drive the picker while it is open. Returns true when it used the key. */
  _mentionKey(e) {
    const mention = this._mention;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      mention.index = (mention.index + (e.key === 'ArrowDown' ? 1 : mention.items.length - 1)) % mention.items.length;
      this._renderMentions();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      this._pickMention(mention.items[mention.index]);
    } else if (e.key === 'Escape') {
      this._closeMentions();
    } else {
      return false;
    }
    e.preventDefault();
    return true;
  }

  _pickMention(member) {
    const el = this.$input;
    const before = el.value.slice(0, this._mention.start);
    const insert = `@${first(member.name)} `;
    el.value = before + insert + el.value.slice(el.selectionStart);
    el.selectionStart = el.selectionEnd = before.length + insert.length;
    this._closeMentions();
    this._onInput();
    el.focus();
  }

  // ---- staying oriented in a busy conversation ----

  _onScroll() {
    const box = this.$msgs;
    const away = box.scrollHeight - box.scrollTop - box.clientHeight > 200;
    if (!away) this._below = 0;
    this.$toBottom.hidden = !away;
    fill(this.$toBottom, h('span', { icon: 'chevron' }), this._below > 0 && h('span', { class: 'badge' }, String(this._below)));
  }

  _toLatest() {
    const state = this.msgs.get(this.activeId);
    if (state?.moreAfter) return (this.msgs.delete(this.activeId), this._select(this.activeId));
    this.$msgs.scrollTop = this.$msgs.scrollHeight;
  }

  _toggleMenu(force) {
    const open = force ?? this.$menu.hidden;
    if (open) {
      const item = (icon, label, color, onclick) => h('button', { type: 'button', role: 'menuitem', onclick: () => (this._toggleMenu(false), onclick()) },
        h('span', { class: 'ic', icon, style: `background:${color}` }), label);
      fill(this.$menu,
        item('image', T('Photo or file'), '#7c5cff', () => this.$file.click()),
        item('poll', T('Poll'), '#f79009', () => this._pollDialog()),
        navigator.geolocation && item('map', T('Location'), '#12b76a', () => this._shareLocation()),
        item('eye', this.viewOnce ? T('View once: on') : T('View once: off'), this.viewOnce ? '#2f6fed' : '#667085', () => {
          this.viewOnce = !this.viewOnce;
          this._renderBanner();
        }),
        item('timer', T('Send later'), '#0ea5e9', () => this._scheduleDialog()),
        // Whatever else the host platform offers: send money, share a product, book a slot...
        (this.actions ?? []).map((a) => item(a.icon in ICON ? a.icon : 'plus', a.label, a.color ?? '#e5484d', () =>
          this._guard(Promise.resolve().then(() => a.run({ conversation: this.convs.get(this.activeId), chat: this.chat, element: this }))))),
      );
    }
    this.$menu.hidden = !open;
  }

  _setDraftMode(mode) {
    this.replyTo = mode?.replyTo ?? null;
    this.editing = mode?.editing ?? null;
    if (this.editing) this.$input.value = this.editing.text;
    else if (!mode) (this.pendingFile = null), (this.pendingMore = []), (this.viewOnce = false);
    this._renderBanner();
    this._onInput();
    this.$input.focus();
  }

  /**
   * What is about to be sent, above the message box: the message being
   * answered or edited, and a strip of thumbnails for attached files, each
   * with its own remove button.
   */
  _renderBanner() {
    const conv = this.convs.get(this.activeId);
    const files = [this.pendingFile, ...(this.pendingMore ?? [])].filter(Boolean);
    const nodes = [];
    if (this.editing || this.replyTo) {
      const target = this.editing ?? this.replyTo;
      nodes.push(h('div', { class: 'banner' },
        h('div', { class: 'bannertext' },
          h('strong', {}, this.editing ? T('Editing message') : T('Replying to {name}', { name: this._memberName(conv, target.senderId) })),
          h('span', {}, this._snippet(target))),
        h('button', { class: 'icon', icon: 'close', type: 'button', title: T('Cancel'), 'aria-label': T('Cancel'), onclick: () => {
          if (this.editing) this.$input.value = '';
          this.replyTo = this.editing = null;
          this._renderBanner();
          this._onInput(true);
        } })));
    }
    if (files.length || this.viewOnce) {
      nodes.push(h('div', { class: 'tray' },
        files.map((file, i) => {
          const isImage = INLINE_IMAGES.has(file.type);
          const thumb = h('div', { class: `thumb${isImage ? '' : ' doc'}`, title: `${file.name} (${size(file.size)})` },
            isImage ? h('img', { alt: file.name }) : [h('span', { icon: 'file' }), h('small', {}, file.name)],
            h('button', { class: 'x', icon: 'close', type: 'button', 'aria-label': T('Remove {name}', { name: file.name }), onclick: () => {
              const rest = files.filter((_, j) => j !== i);
              this.pendingFile = rest[0] ?? null;
              this.pendingMore = rest.slice(1);
              this._renderBanner();
              this._onInput(true);
            } }));
          if (isImage) {
            const url = URL.createObjectURL(file);
            const img = thumb.querySelector('img');
            img.src = url;
            img.onload = () => URL.revokeObjectURL(url);
          }
          return thumb;
        }),
        files.length > 0 && files.length < 10 && h('button', { class: 'thumb add', icon: 'plus', type: 'button', title: T('Attach'), 'aria-label': T('Attach'), onclick: () => ((this._appending = true), this.$file.click()) }),
        this.viewOnce && h('button', { class: 'chip on', type: 'button', onclick: () => ((this.viewOnce = false), this._renderBanner()) }, h('span', { icon: 'eye' }), T('View once')),
      ));
    }
    const box = this.$msgs;
    const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    this.$banner.hidden = !nodes.length;
    fill(this.$banner, nodes);
    if (atEnd) box.scrollTop = box.scrollHeight; // keep the latest message in view as the composer grows
  }

  async _submit() {
    const text = this.$input.value.trim();
    const { editing, replyTo, pendingFile: file, activeId: id, viewOnce } = this;
    const more = this.pendingMore ?? [];
    if (!text && !file) return;
    const conv = this.convs.get(id);
    // Writing "@Ama" notifies Ama even if she muted the group.
    const mentions = conv.type === 'group'
      ? conv.members.filter((m) => m.userId !== this.chat.me.id && text.toLowerCase().includes(`@${first(m.name).toLowerCase()}`)).map((m) => m.userId)
      : [];
    this.$input.value = '';
    this._saveDraft(id, '');
    this._closeMentions();
    this._setDraftMode(null);
    if (editing) {
      try {
        await this.chat.edit(editing, text);
      } catch (e) {
        if (this.activeId === id && !this.$input.value) (this.$input.value = text), this._onInput(true);
        this._error(e.message);
      }
      return;
    }
    // The text travels with the first file; any further files follow in order.
    await this._deliver(id, { text, file, replyTo: replyTo?.id, viewOnce, mentions: mentions.length ? mentions : undefined });
    for (const extra of more) await this._deliver(id, { text: '', file: extra, viewOnce });
  }

  /**
   * Show the message at once, marked as sending, then swap in the real one.
   * If it fails it stays in the thread with a way to retry, instead of vanishing.
   */
  async _deliver(id, content, pendingId = `pending:${crypto.randomUUID()}`) {
    const state = this.msgs.get(id);
    const show = (patch) => {
      if (!state) return;
      const pending = {
        id: pendingId, pending: true, conversationId: id, senderId: this.chat.me.id, kind: 'text',
        text: content.text || (content.file ? this._fileLabel({ name: content.file.name, mime: content.file.type }) : ''), file: null, replyTo: content.replyTo ?? null,
        createdAt: Date.now(), reactions: {}, mentions: [], content, ...patch,
      };
      state.list = [...state.list.filter((m) => m.id !== pendingId), pending];
      if (this.activeId === id) this._renderMessages({ stick: true, instant: true });
    };
    if (!state?.moreAfter) show({});
    try {
      const sent = await this.chat.send(id, content);
      if (state) {
        state.list = state.list.filter((m) => m.id !== pendingId);
        if (!state.moreAfter && !state.list.some((m) => m.id === sent.id)) state.list.push(sent);
        if (this.activeId === id) this._renderMessages({ stick: true, instant: true });
      }
    } catch (e) {
      show({ failed: e.message });
      if (!state) this._error(e.message);
    }
  }

  _shareLocation() {
    const id = this.activeId;
    navigator.geolocation.getCurrentPosition(
      (pos) => this._guard(this.chat.sendLocation(id, { lat: pos.coords.latitude, lng: pos.coords.longitude })),
      () => this._error(T('Location permission was denied.')),
      { timeout: 15_000 },
    );
  }

  /**
   * Record a voice note. The composer turns into a recording bar: a way to
   * throw it away, a running timer, a live level, and the send button.
   */
  async _startRecording() {
    if (this._rec) return;
    const id = this.activeId;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return this._error(T('Microphone permission was denied.'));
    }
    if (this.activeId !== id || this._rec) return stream.getTracks().forEach((t) => t.stop());

    const rec = (this._rec = new MediaRecorder(stream));
    const chunks = [];
    const started = Date.now();
    const meter = new (globalThis.AudioContext ?? globalThis.webkitAudioContext)();
    const analyser = meter.createAnalyser();
    analyser.fftSize = 256;
    meter.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    const $time = h('span', { class: 'rectime', role: 'timer' }, '0:00');
    const $wave = h('div', { class: 'wave', 'aria-hidden': 'true' });
    fill(this.$rec,
      h('button', { class: 'icon trash', icon: 'trash', type: 'button', title: T('Cancel recording'), 'aria-label': T('Cancel recording'), onclick: () => this._stopRecording(true) }),
      h('span', { class: 'recdot' }), $time, $wave);
    rec.ticker = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      for (const v of samples) peak = Math.max(peak, Math.abs(v - 128));
      const bar = h('i');
      bar.style.height = `${Math.max(10, Math.min(100, Math.round((peak / 64) * 100)))}%`;
      $wave.append(bar);
      while ($wave.children.length > 60) $wave.firstChild.remove();
      $time.textContent = mmss(Date.now() - started);
    }, 90);

    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      for (const t of stream.getTracks()) t.stop();
      meter.close().catch(() => {});
      // Anything under half a second is a slip of the finger, not a message.
      if (rec.discard || !chunks.length || Date.now() - started < 500) return;
      const type = (rec.mimeType || 'audio/webm').split(';')[0];
      this._deliver(id, { file: new File(chunks, `voice-note.${type.split('/')[1]}`, { type }) });
    };
    rec.start();
    this.$composer.classList.add('recording');
    this._onInput(true);
  }

  _stopRecording(discard) {
    const rec = this._rec;
    if (!rec) return;
    this._rec = null;
    clearInterval(rec.ticker);
    rec.discard = discard;
    rec.stop();
    if (this.$composer?.isConnected) {
      this.$composer.classList.remove('recording');
      this._onInput(true);
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
    this.$dialog.className = '';
    fill(this.$dialog, ...content);
    if (!this.$dialog.open) this.$dialog.showModal();
  }

  _dialogTitle(text) {
    const close = () => this.$dialog.close();
    return h('h3', {},
      h('button', { class: 'icon pageback', icon: 'back', type: 'button', 'aria-label': T('Back'), onclick: close }),
      h('span', {}, text),
      h('button', { class: 'icon pageclose', icon: 'close', type: 'button', 'aria-label': T('Close'), onclick: close }));
  }

  /** A searchable people list. `onPick(user, row)` fires when one is chosen. */
  _peoplePicker({ exclude = new Set(), render }) {
    const $people = h('div', { class: 'people' });
    let ticket = 0;
    const search = async (q) => {
      const mine = ++ticket;
      let users = [];
      try {
        users = (await this.chat.searchUsers(q)).filter((u) => !exclude.has(u.id));
      } catch (e) {
        return fill($people, h('div', { class: 'hint' }, e.message));
      }
      if (mine !== ticket) return;
      users = render.merge ? render.merge(users) : users;
      fill($people, ...(users.length ? users.map(render) : [h('div', { class: 'hint' }, T('Nobody found. Try their exact email, phone number or username.'))]));
    };
    const later = debounce(search, 200);
    const $search = h('input', { type: 'search', placeholder: T('Name, or exact email / phone / username'), 'aria-label': T('Search people'), oninput: (e) => later(e.target.value) });
    search('');
    return { $search, $people };
  }

  _newChatDialog() {
    if (!this.chat?.me) return;
    const picked = new Map();
    const $title = h('input', { type: 'text', placeholder: T('Group name'), maxlength: '120', 'aria-label': T('Group name'), hidden: true });
    const mustEncrypt = !!this.chat.me.features?.requireEncryption;
    const $e2ee = h('input', { type: 'checkbox', checked: mustEncrypt, disabled: mustEncrypt });
    const $announce = h('input', { type: 'checkbox' });
    const $announceRow = h('label', { class: 'check', hidden: true }, $announce, h('span', {}, T('Announcement channel'), h('small', {}, T('Only you and admins you appoint can post.'))));
    const $err = h('div', { class: 'error', hidden: true, role: 'alert' });
    const $go = h('button', { class: 'btn', type: 'submit', disabled: true }, T('Start chat'));
    const $code = h('input', { type: 'text', placeholder: T('Have an invite code?'), 'aria-label': T('Invite code'), maxlength: '40' });
    const sync = () => {
      $title.hidden = $announceRow.hidden = picked.size < 2;
      $go.disabled = picked.size === 0;
      $go.textContent = picked.size > 1 ? T('Create group ({n})', { n: picked.size + 1 }) : T('Start chat');
    };
    const render = (u) => {
      const box = h('input', { type: 'checkbox', checked: picked.has(u.id), onchange: () => {
        if (box.checked) picked.set(u.id, u);
        else picked.delete(u.id);
        sync();
      } });
      return h('label', { class: 'person' }, box, this._avatar(u.name, u.avatar, { small: true, online: u.online }), h('span', {}, u.name));
    };
    render.merge = (users) => [...[...picked.values()].filter((p) => !users.some((u) => u.id === p.id)), ...users];
    const { $search, $people } = this._peoplePicker({ render });
    this._openPage(h('form', { onsubmit: async (e) => {
      e.preventDefault();
      $go.disabled = true;
      try {
        const ids = [...picked.keys()];
        const encrypted = $e2ee.checked;
        let conv;
        if (ids.length === 1) conv = await this.chat.openDm(ids[0], { encrypted });
        else {
          conv = await this.chat.createGroup({ title: $title.value.trim() || [...picked.values()].map((u) => first(u.name)).join(', ').slice(0, 120), memberIds: ids, encrypted });
          if ($announce.checked) conv = await this.chat.update(conv.id, { announce: true });
        }
        this.convs.set(conv.id, conv);
        this.$dialog.close();
        this._select(conv.id);
      } catch (err) {
        $err.textContent = err.message;
        $err.hidden = false;
        sync();
      }
    } },
      this._dialogTitle(T('New chat')), $search, $people, $title, $announceRow,
      this._on('e2ee') && h('label', { class: 'check' }, $e2ee,
        h('span', {}, T('End-to-end encrypt'), h('small', {}, T('Only members can read messages, on the device where they joined. Not even the server can.')))),
      $err, $go,
      h('div', { class: 'inline' }, $code, h('button', { class: 'btn plain', type: 'button', onclick: () => $code.value.trim() && this._joinInvite($code.value.trim()).catch((e) => (($err.textContent = e.message), ($err.hidden = false))) }, T('Join'))),
    ));
  }

  async _joinInvite(code) {
    const conv = await this.chat.joinByInvite(code);
    this.convs.set(conv.id, conv);
    if (this.$dialog.open) this.$dialog.close();
    await this._select(conv.id);
  }

  async _detailsDialog(conv) {
    const me = this.chat.me.id;
    const isGroup = conv.type === 'group';
    const canManage = !isGroup || this._role(conv) !== 'member';
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
    const toggle = (label, checked, onchange, hint) => {
      // If the change is refused, the switch goes back to where it was instead of showing a setting that did not take.
      const box = h('input', { type: 'checkbox', checked, onchange: () => run(Promise.resolve().then(() => onchange(box.checked)).catch((e) => {
        box.checked = !box.checked;
        throw e;
      })) });
      return h('label', { class: 'check' }, box, h('span', {}, label, hint && h('small', {}, hint)));
    };
    const $timer = h('select', { disabled: !canManage, onchange: () => run(this.chat.update(conv.id, { ttlSeconds: Number($timer.value) || null })) },
      TIMERS.map(([s, label]) => h('option', { value: String(s), selected: (conv.ttlSeconds ?? 0) === s }, T(label))));
    const $code = h('div', { class: 'code' }, '…');
    if (conv.encrypted) this.chat.safetyCode(conv.id).then((c) => ($code.textContent = c), () => ($code.textContent = T('unavailable')));
    const other = isGroup ? null : this._other(conv);
    const blocked = other ? (await this.chat.blocked().catch(() => [])).includes(other.userId) : false;

    const $invite = h('div', { class: 'field' }, h('button', { class: 'btn plain', onclick: async () => {
      try {
        const { code } = await this.chat.createInvite(conv.id);
        // The host decides what a shareable link looks like; it gets the code to build one.
        const event = new CustomEvent('plugchat:invite', { detail: { code, conversation: conv, text: code } });
        this.dispatchEvent(event);
        const $code = h('input', { type: 'text', readonly: true, value: event.detail.text, 'aria-label': T('Invite code'), onfocus: (e) => e.target.select() });
        fill($invite, T('Anyone on this platform with this code can join for the next 7 days.'), $code,
          h('button', { class: 'btn plain', onclick: (e) => navigator.clipboard?.writeText(event.detail.text).then(() => (e.target.textContent = T('Copied'))) }, T('Copy')));
      } catch (e) {
        $err.textContent = e.message;
        $err.hidden = false;
      }
    } }, T('Create invite code')));
    const $name = h('input', { type: 'text', value: conv.title ?? '', maxlength: '120', 'aria-label': T('Group name') });
    const isOwner = isGroup && this._role(conv) === 'owner';
    const $desc = h('input', { type: 'text', value: conv.description ?? '', maxlength: '500', placeholder: T('Description'), 'aria-label': T('Description') });
    const adder = isGroup && canManage && this._peoplePicker({
      exclude: new Set(conv.members.map((m) => m.userId)),
      render: (u) => h('button', { class: 'person', type: 'button', onclick: () => run(this.chat.addMembers(conv.id, [u.id]), true) },
        this._avatar(u.name, u.avatar, { small: true }), h('span', {}, u.name), h('small', {}, T('Add'))),
    });

    this._openPage(h('div', { class: 'panel' },
      this._dialogTitle(isGroup ? T('Group info') : T('Contact info')),
      // The familiar top of an info screen: a large picture, the name, and a line about them.
      h('div', { class: 'hero' },
        isGroup && canManage
          ? h('button', { class: 'photo', title: T('Change photo'), 'aria-label': T('Change photo'), onclick: async () => {
            const picture = await this._pickPicture();
            if (picture) run(this.chat.setGroupAvatar(conv.id, picture).then(() => this._toast(T('Photo updated'))), true);
          } }, this._avatar(this._title(conv), conv.avatar), h('span', { class: 'cam', icon: 'camera' }))
          : this._avatar(this._title(conv), other ? other.avatar : conv.avatar, { online: !!other && this.chat.online.has(other.userId) }),
        h('strong', {}, this._title(conv)),
        h('small', {}, isGroup ? T('{n} members', { n: conv.members.length }) : this.chat.online.has(other.userId) ? T('Online') : T('Offline')),
        conv.encrypted && h('small', { class: 'lockline' }, h('span', { icon: 'lock' }), T('End-to-end encrypted'))),
      isGroup && canManage && h('div', { class: 'inline' }, $name, h('button', { class: 'btn plain', onclick: () => $name.value.trim() && run(this.chat.update(conv.id, { title: $name.value.trim() }), true) }, T('Rename'))),
      isGroup && canManage && h('div', { class: 'inline' }, $desc, h('button', { class: 'btn plain', onclick: () => run(this.chat.update(conv.id, { description: $desc.value.trim() }), true) }, T('Save'))),
      isGroup && !canManage && conv.description && h('div', { class: 'field' }, conv.description),
      h('div', { class: 'people' }, conv.members.map((m) =>
        h('div', { class: 'person' }, this._avatar(m.name, m.avatar, { small: true, online: this.chat.online.has(m.userId) }),
          m.userId === me ? h('span', {}, T('{name} (you)', { name: m.name })) : h('button', { class: 'namebtn', onclick: () => this._profileDialog(m.userId) }, m.name),
          m.role !== 'member' && h('small', {}, T(m.role)),
          isOwner && m.userId !== me && h('button', { class: 'linkbtn', onclick: () => run(this.chat.setRole(conv.id, m.userId, m.role === 'admin' ? 'member' : 'admin'), true) }, m.role === 'admin' ? T('Remove admin') : T('Make admin')),
          isOwner && m.userId !== me && h('button', { class: 'linkbtn', onclick: () => run(this.chat.setRole(conv.id, m.userId, 'owner'), true) }, T('Make owner')),
          isGroup && canManage && m.userId !== me && m.role !== 'owner'
            && h('button', { class: 'icon', icon: 'close', title: T('Remove {name}', { name: m.name }), 'aria-label': T('Remove {name}', { name: m.name }), onclick: () => run(this.chat.removeMember(conv.id, m.userId), true) })))),
      adder && h('div', { class: 'field' }, T('Add people'), adder.$search, adder.$people),
      isGroup && canManage && !conv.encrypted && $invite,
      toggle(T('Mute notifications'), conv.muted, (v) => this.chat.settings(conv.id, { muted: v })),
      toggle(T('Pin to top'), conv.pinned, (v) => this.chat.settings(conv.id, { pinned: v })),
      toggle(T('Archive'), conv.archived, (v) => this.chat.settings(conv.id, { archived: v })),
      isGroup && canManage && toggle(T('Announcement channel'), conv.announce, (v) => this.chat.update(conv.id, { announce: v }), T('Only admins can post.')),
      h('label', { class: 'field' }, T('Disappearing messages'), $timer),
      conv.encrypted && h('label', { class: 'field' }, T('Safety code — compare with the other members in person. If it matches, nobody has tampered with your keys.'), $code),
      $err,
      h('button', { class: 'btn plain', onclick: () => this._mediaDialog(conv) }, T('Media and files')),
      h('button', { class: 'btn plain', onclick: (e) => run(this._exportChat(conv, e.target)) }, T('Export chat')),
      isGroup && h('button', { class: 'btn warn', onclick: () => run(this.chat.leave(conv.id), true) }, T('Leave group')),
      other && h('button', { class: 'btn warn', onclick: () => run(blocked ? this.chat.unblock(other.userId) : this.chat.block(other.userId), true) }, blocked ? T('Unblock {name}', { name: other.name }) : T('Block {name}', { name: other.name })),
    ));
  }

  _pollDialog() {
    const id = this.activeId;
    const option = () => h('input', { type: 'text', placeholder: T('Option'), maxlength: '100', 'aria-label': T('Option') });
    const $question = h('input', { type: 'text', placeholder: T('Ask a question'), maxlength: '200', 'aria-label': T('Question'), required: true });
    const $options = h('div', { class: 'field' }, option(), option());
    const $multi = h('input', { type: 'checkbox' });
    const $err = h('div', { class: 'error', hidden: true, role: 'alert' });
    this._openDialog(h('form', { onsubmit: async (e) => {
      e.preventDefault();
      const options = [...$options.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
      if (options.length < 2) return ($err.textContent = T('Add at least two options.')), ($err.hidden = false);
      try {
        await this.chat.sendPoll(id, { question: $question.value.trim(), options, multi: $multi.checked });
        this.$dialog.close();
      } catch (err) {
        $err.textContent = err.message;
        $err.hidden = false;
      }
    } },
      this._dialogTitle(T('Create a poll')), $question, $options,
      h('button', { class: 'btn plain', type: 'button', onclick: (e) => ($options.children.length < 12 ? $options.append(option()) : (e.target.disabled = true)) }, T('Add option')),
      h('label', { class: 'check' }, $multi, h('span', {}, T('Allow several answers'))),
      $err, h('button', { class: 'btn', type: 'submit' }, T('Send poll')),
    ));
  }

  _forwardDialog(m) {
    const source = this.opened.get(m.id) ?? m;
    const $err = h('div', { class: 'error', hidden: true, role: 'alert' });
    const targets = [...this.convs.values()].filter((c) => !(c.announce && this._role(c) === 'member')).sort((a, b) => b.updatedAt - a.updatedAt);
    this._openDialog(h('div', { class: 'panel' },
      this._dialogTitle(T('Forward to…')),
      h('div', { class: 'people' }, targets.map((c) => h('button', { class: 'person', onclick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          await this.chat.forward(source, c.id);
          this.$dialog.close();
        } catch (err) {
          $err.textContent = err.message;
          $err.hidden = false;
        }
      } }, this._avatar(this._title(c), null, { small: true }), h('span', {}, this._title(c)), c.encrypted && h('small', {}, T('encrypted'))))),
      $err,
    ));
  }

  _reportDialog(m) {
    const $reason = h('select', { 'aria-label': T('Reason') }, REPORT_REASONS.map((r) => h('option', { value: r }, T(r))));
    const $done = h('div', { class: 'hint', hidden: true }, T('Thanks. The report was sent to the moderators.'));
    const $go = h('button', { class: 'btn', onclick: async () => {
      $go.disabled = true;
      await this.chat.report(m.id, $reason.value).then(() => ($done.hidden = false), (e) => ($done.textContent = e.message, $done.hidden = false));
    } }, T('Send report'));
    this._openDialog(h('div', { class: 'panel' }, this._dialogTitle(T('Report message')),
      h('label', { class: 'field' }, T('What is wrong with this message? The moderators of this platform will receive a copy of it.'), $reason), $go, $done));
  }

  _newStoryDialog() {
    const $text = h('textarea', { placeholder: T('Share an update…'), maxlength: '2000', 'aria-label': T('Story text') });
    const $file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', 'aria-label': T('Photo') });
    const $err = h('div', { class: 'error', hidden: true, role: 'alert' });
    this._openDialog(h('form', { onsubmit: async (e) => {
      e.preventDefault();
      if (!$text.value.trim() && !$file.files[0]) return;
      try {
        await this.chat.postStory({ text: $text.value.trim(), file: $file.files[0] });
        this.$dialog.close();
        this._loadStories();
      } catch (err) {
        $err.textContent = err.message;
        $err.hidden = false;
      }
    } },
      this._dialogTitle(T('Add to your story')), $text, $file,
      h('small', { class: 'field' }, T('Visible for 24 hours to the people you have conversations with. Stories are not end-to-end encrypted.')),
      $err, h('button', { class: 'btn', type: 'submit' }, T('Post story')),
    ));
  }

  /**
   * Stories play full screen: progress bars along the top that fill and move
   * on by themselves, tap the right side for the next and the left for the
   * previous, the author's picture and name above.
   */
  _storyDialog(group, index = Math.max(0, group.stories.findIndex((s) => !s.seen))) {
    this.$root.querySelector('.storyfs')?.remove();
    clearTimeout(this._storyTimer);
    const story = group.stories[index];
    if (!story) return;
    const mine = group.user.id === this.chat.me.id;
    const SECONDS = 6;
    if (!story.seen) {
      story.seen = true;
      this.chat.viewStory(story.id).then(() => this._loadStories(), () => {});
    }
    const close = () => {
      clearTimeout(this._storyTimer);
      view.remove();
    };
    const go = (i) => (i < 0 ? this._storyDialog(group, 0) : i >= group.stories.length ? close() : this._storyDialog(group, i));

    const $body = h('div', { class: 'storybody' });
    $body.style.background = `linear-gradient(160deg, hsl(${hue(group.user.name)} 55% 38%), hsl(${(hue(group.user.name) + 60) % 360} 60% 24%))`;
    if (story.attachment && INLINE_IMAGES.has(story.attachment.mime)) {
      const img = h('img', { alt: T('Story photo') });
      let url = this.blobs.get(story.attachment.fileId);
      if (!url) this.blobs.set(story.attachment.fileId, (url = this.chat.storyFile(story).then((b) => URL.createObjectURL(b))));
      url.then((u) => (img.src = u), () => (img.alt = T('Photo unavailable')));
      $body.append(img);
    }
    if (story.text) $body.append(h('p', { class: story.attachment ? 'caption' : '' }, linkify(story.text)));

    const view = h('div', { class: 'storyfs', role: 'dialog', 'aria-label': T('Story') },
      h('div', { class: 'steps' }, group.stories.map((_, i) => {
        const bar = h('i', { class: i < index ? 'on' : i === index ? 'now' : '' }, h('b'));
        if (i === index) bar.firstChild.style.animationDuration = `${SECONDS}s`;
        return bar;
      })),
      h('div', { class: 'storyhead' },
        this._avatar(group.user.name, group.user.avatar, { small: true }),
        h('strong', {}, mine ? T('My story') : group.user.name),
        h('small', {}, shortWhen(story.createdAt)),
        h('button', { class: 'icon', icon: 'close', 'aria-label': T('Close'), onclick: close })),
      $body,
      h('button', { class: 'tap prev', 'aria-label': T('Previous'), onclick: () => go(index - 1) }),
      h('button', { class: 'tap next', 'aria-label': T('Next'), onclick: () => go(index + 1) }),
      mine && h('div', { class: 'storyfoot' },
        h('span', {}, h('span', { icon: 'eye' }), story.views.length ? T('Seen by {names}', { names: story.views.map((v) => this._knownName(v.userId)).join(', ') }) : T('No views yet')),
        h('button', { class: 'icon', icon: 'plus', title: T('Add to your story'), 'aria-label': T('Add to your story'), onclick: () => (close(), this._newStoryDialog()) }),
        h('button', { class: 'icon', icon: 'trash', title: T('Delete'), 'aria-label': T('Delete'), onclick: () => this.chat.deleteStory(story.id).then(() => (close(), this._loadStories()), (e) => this._error(e.message)) })),
    );
    view.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    });
    this.$root.append(view);
    view.tabIndex = -1;
    view.focus();
    this._storyTimer = setTimeout(() => view.isConnected && go(index + 1), SECONDS * 1000);
  }

  _knownName(userId) {
    for (const c of this.convs.values()) {
      const m = c.members.find((x) => x.userId === userId);
      if (m) return m.name;
    }
    return T('Someone');
  }

  // ---- personal settings ----

  /** The person's own screen: their picture and about line, then privacy, notifications, security and data. */
  async _settingsDialog() {
    if (!this.chat?.me) return;
    const me = this.chat.me;
    const $err = h('div', { class: 'error', hidden: true, role: 'alert' });
    const run = (p) => Promise.resolve(p).catch((e) => {
      $err.textContent = e.message;
      $err.hidden = false;
      $err.scrollIntoView({ block: 'nearest' });
    });
    const row = (label, checked, onchange, hint) => {
      // If the change is refused, the switch goes back to where it was instead of showing a setting that did not take.
      const box = h('input', { type: 'checkbox', role: 'switch', checked, onchange: () => run(Promise.resolve().then(() => onchange(box.checked)).catch((e) => {
        box.checked = !box.checked;
        throw e;
      })) });
      return h('label', { class: 'setrow' }, h('span', {}, label, hint && h('small', {}, hint)), box);
    };
    const link = (icon, label, onclick, cls = '') => h('button', { class: `setrow link ${cls}`, onclick }, h('span', { icon }), h('span', {}, label), h('span', { class: 'go', icon: 'next' }));
    const privacy = me.privacy ?? { readReceipts: true, presence: true };
    const mine = this.chat.identity?.deviceId;
    const [devices, backup] = mine ? await Promise.all([this.chat.devices().catch(() => []), this.chat.backupStatus().catch(() => null)]) : [[], null];
    const $pass = h('input', { type: 'password', placeholder: T('Passphrase'), 'aria-label': T('Passphrase'), autocomplete: 'off' });
    const $about = h('input', { type: 'text', value: me.about ?? '', maxlength: '140', placeholder: T('About: a line others see under your name'), 'aria-label': T('About') });
    const download = async () => {
      const blob = new Blob([JSON.stringify(await this.chat.exportMyData(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      h('a', { href: url, download: 'my-chat-data.json' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    };
    const changePhoto = async () => {
      const picture = await this._pickPicture();
      if (picture) await run(this.chat.setAvatar(picture).then(() => (this._toast(T('Photo updated')), this._settingsDialog())));
    };

    this._openPage(h('div', { class: 'panel' },
      this._dialogTitle(T('Settings')),
      h('div', { class: 'hero' },
        h('button', { class: 'photo', title: T('Change photo'), 'aria-label': T('Change photo'), onclick: changePhoto },
          this._avatar(me.name, me.avatar), h('span', { class: 'cam', icon: 'camera' })),
        h('strong', {}, me.name),
        me.avatar?.startsWith('pc:') && h('button', { class: 'linkbtn', onclick: () => run(this.chat.removeAvatar().then(() => this._settingsDialog())) }, T('Remove photo'))),
      h('div', { class: 'inline' }, $about,
        h('button', { class: 'btn plain', onclick: () => run(this.chat.setAbout($about.value).then(() => this._toast(T('Saved')))) }, T('Save'))),

      h('div', { class: 'group' }, h('h4', {}, T('Appearance')),
        h('div', { class: 'seg', role: 'radiogroup', 'aria-label': T('Appearance') }, [['system', T('Automatic')], ['light', T('Light')], ['dark', T('Dark')]].map(([key, label]) =>
          h('button', { role: 'radio', 'aria-checked': String(this._themeChoice() === key), onclick: (e) => {
            this._setTheme(key);
            for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-checked', String(b === e.currentTarget));
          } }, label)))),

      h('div', { class: 'group' }, h('h4', {}, T('Privacy')),
        row(T('Send read receipts'), privacy.readReceipts, (v) => this.chat.setPrivacy({ readReceipts: v }), T('Others see when you have read their messages.')),
        row(T('Show when I am online'), privacy.presence, (v) => this.chat.setPrivacy({ presence: v }))),

      globalThis.Notification && h('div', { class: 'group' }, h('h4', {}, T('Notifications')),
        row(T('Desktop notifications'), this._notifyOn() && Notification.permission === 'granted', async (v) => {
          if (v && (await Notification.requestPermission()) !== 'granted') throw new Error(T('Notifications are blocked in this browser.'));
          localStorage.setItem('plugchat:notify', v ? 'on' : 'off');
        }, T('Show a notification when a message arrives and you are not looking at the chat.')),
        row(T('Show message text in notifications'), this._previewsOn(), async (v) => {
          localStorage.setItem('plugchat:notify-preview', v ? 'on' : 'off');
        })),

      mine && h('div', { class: 'group' }, h('h4', {}, T('Encrypted chats')),
        backup && (backup.enabledHere
          ? [h('p', { class: 'note' }, T('Backup is on. Your encrypted chats can be restored with your passphrase.')),
            link('trash', T('Turn off and delete backup'), () => run(this.chat.disableBackup().then(() => this._settingsDialog())), 'danger')]
          : [h('p', { class: 'note' }, backup.exists ? T('Enter your passphrase to read your encrypted chats on this device.') : T('Choose a long passphrase. Without it the backup cannot be opened, by you or anyone else.')),
            h('div', { class: 'inline' }, $pass,
              h('button', { class: 'btn', onclick: () => run((backup.exists ? this.chat.restoreBackup($pass.value) : this.chat.enableBackup($pass.value)).then(() => this._settingsDialog())) },
                backup.exists ? T('Restore') : T('Turn on backup')))]),
        devices.length > 0 && [h('p', { class: 'note' }, T('Devices that can read your encrypted chats.')),
          devices.map((d) => h('div', { class: 'setrow' },
            h('span', {}, d.deviceId === mine ? T('This device') : new Date(d.lastSeen).toLocaleDateString(LOCALE, { dateStyle: 'medium' })),
            d.deviceId !== mine && h('button', { class: 'linkbtn', onclick: (e) => run(this.chat.removeDevice(d.deviceId).then(() => e.target.closest('.setrow').remove())) }, T('Remove'))))]),

      h('div', { class: 'group' }, h('h4', {}, T('Your data')),
        link('star', T('Starred messages'), () => this._starredDialog()),
        link('download', T('Download my data'), () => run(download()))),
      $err,
    ));
  }

  async _starredDialog() {
    const list = await this.chat.starred().catch(() => []);
    this._openPage(h('div', { class: 'panel' },
      this._dialogTitle(T('Starred messages')),
      list.length === 0 && h('div', { class: 'hint' }, T('No starred messages yet.')),
      h('div', { class: 'people' }, list.map((m) => {
        const conv = this.convs.get(m.conversationId);
        if (!conv) return null;
        return h('button', { class: 'person', onclick: () => (this.$dialog.close(), this._select(conv.id, m.id)) },
          this._avatar(this._title(conv), null, { small: true }),
          h('span', {}, `${first(this._memberName(conv, m.senderId))}: ${this._snippet(m)}`), h('small', {}, shortWhen(m.createdAt)));
      })),
    ));
  }

  // ---- calls ----

  _external() {
    return this.chat.me.features?.calls === 'external';
  }

  async _call(conv, other, video) {
    if (!this._external()) return this._startCall(conv, other, video);
    try {
      const { call, join } = await this.chat.startCall(conv.id, { video });
      await this._openCall(call.id, conv, join);
    } catch (e) {
      this._error(e.message);
    }
  }

  /**
   * Join a call that runs on the host's own vendor. The host can take over by
   * calling preventDefault() on the `plugchat:call-join` event and using the
   * vendor's SDK with `detail.data`; otherwise `detail.url` opens in a frame.
   */
  async _openCall(callId, conv, join) {
    try {
      join ??= (await this.chat.joinCall(callId)).join;
    } catch (e) {
      return this._error(e.message);
    }
    const event = new CustomEvent('plugchat:call-join', { cancelable: true, detail: { callId, conversation: conv, url: join.url, data: join.data } });
    if (!this.dispatchEvent(event)) return;
    if (!join.url) return this._error(T('This call can only be opened by the app.'));
    this.$root.querySelector('.call')?.remove();
    const overlay = h('div', { class: 'call', role: 'dialog', 'aria-label': T('Call') },
      h('iframe', { src: join.url, allow: 'camera; microphone; display-capture; autoplay; fullscreen', title: T('Call'), referrerpolicy: 'no-referrer' }),
      h('div', { class: 'cbtns' }, h('button', { icon: 'close', class: 'hang', title: T('Leave call'), 'aria-label': T('Leave call'), onclick: () => overlay.remove() })));
    this.$root.append(overlay);
  }

  _ring(m) {
    const conv = this.convs.get(m.conversationId);
    const name = this._memberName(conv, m.senderId);
    this.$root.querySelector('.call')?.remove();
    const close = () => (clearTimeout(timer), overlay.remove());
    const overlay = h('div', { class: 'call ringing', role: 'alertdialog', 'aria-label': T('Incoming call from {name}', { name }) },
      h('div', { class: 'cinfo' }, this._avatar(name, conv?.members.find((x) => x.userId === m.senderId)?.avatar), h('strong', {}, name),
        h('div', { role: 'status' }, (m.call.video ? T('Incoming video call…') : T('Incoming voice call…')) + (conv?.type === 'group' ? ` · ${conv.title}` : ''))),
      h('div', { class: 'cbtns' },
        h('button', { icon: 'phone', class: 'ok', title: T('Accept'), 'aria-label': T('Accept'), onclick: () => (close(), this._openCall(m.call.callId, conv)) }),
        h('button', { icon: 'close', class: 'hang', title: T('Decline'), 'aria-label': T('Decline'), onclick: close })));
    const timer = setTimeout(close, 45_000);
    this.$root.append(overlay);
    this.dispatchEvent(new CustomEvent('plugchat:call', { detail: { message: m } }));
  }

  async _startCall(conv, other, video) {
    try {
      this._showCall(await this.calls.start(conv.id, other.userId, { video }));
    } catch (e) {
      this._error(e.message);
    }
  }

  _showCall(call) {
    const conv = this.convs.get(call.conversationId);
    const name = this._memberName(conv, call.peerId);
    const $remote = h('video', { class: 'remote', autoplay: true, playsinline: true, hidden: !call.video });
    const $local = h('video', { class: 'local', autoplay: true, playsinline: true, hidden: !call.video });
    $local.muted = true;
    const $state = h('div', { role: 'status' });
    const $btns = h('div', { class: 'cbtns' });
    const overlay = h('div', { class: 'call', role: 'dialog', 'aria-label': T('Call with {name}', { name }) },
      $remote, h('div', { class: 'cinfo' }, this._avatar(name, conv?.members.find((x) => x.userId === call.peerId)?.avatar), h('strong', {}, name), $state), $local, $btns);
    let muted = false, camera = call.video, ticker;
    const btn = (icon, label, cls, onclick) => h('button', { icon, title: label, 'aria-label': label, class: cls, onclick });
    const render = () => {
      overlay.classList.toggle('ringing', call.state === 'ringing');
      $state.textContent = call.state === 'ringing' ? (call.direction === 'in' ? (call.video ? T('Incoming video call…') : T('Incoming voice call…')) : T('Ringing…'))
        : call.state === 'connecting' ? T('Connecting…')
        : call.state === 'active' ? mmss(Date.now() - call.startedAt)
        : T('Call ended') + (call.reason && call.reason !== 'ended' ? ` · ${T(call.reason)}` : '');
      if (call.state === 'ended') return fill($btns, );
      if (call.state === 'ringing' && call.direction === 'in') {
        return fill($btns, btn('phone', T('Accept'), 'ok', () => call.accept()), btn('close', T('Decline'), 'hang', () => call.decline()));
      }
      fill($btns, 
        btn('mic', muted ? T('Unmute') : T('Mute'), muted ? 'off' : '', () => (call.setMuted((muted = !muted)), render())),
        call.video && btn('video', camera ? T('Turn camera off') : T('Turn camera on'), camera ? '' : 'off', () => (call.setCamera((camera = !camera)), render())),
        btn('close', T('Hang up'), 'hang', () => call.hangup()),
      );
    };
    call.on('local', (s) => ($local.srcObject = s));
    call.on('remote', (s) => ($remote.srcObject = s));
    if (call.localStream) $local.srcObject = call.localStream;
    call.on('state', (s) => {
      render();
      if (s === 'active') ticker = setInterval(render, 1000);
      if (s === 'ended') {
        clearInterval(ticker);
        setTimeout(() => overlay.remove(), 1800);
      }
    });
    // An audio-only call still needs an element to play the remote stream.
    if (!call.video) $remote.hidden = false, ($remote.style.opacity = '0');
    render();
    this.$root.append(overlay);
    this.dispatchEvent(new CustomEvent('plugchat:call', { detail: { call } }));
  }
}

if (!customElements.get('plug-chat')) customElements.define('plug-chat', PlugChatElement);
export { PlugChatElement };
