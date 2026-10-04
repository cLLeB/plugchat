// <plug-chat-launcher> — a floating chat button with an unread badge that
// opens the chat in a corner panel. For sites that have no page to give chat.
//
//   <script type="module" src="/plugchat/client/launcher.js"></script>
//   <plug-chat-launcher server="/plugchat" token-url="/api/chat-token"></plug-chat-launcher>
//
// It accepts every attribute and property <plug-chat> does, plus:
//   position="left"   put the button bottom-left instead of bottom-right
//   label="Messages"  accessible name of the button
import './element.js';

const STYLE = `
:host { --pc-accent: #e8452c; --pc-accent-fg: #fff; position: fixed; bottom: 20px; right: 20px; z-index: 2147483000; font: 14px system-ui, sans-serif; }
:host([position="left"]) { right: auto; left: 20px; }
button { width: 56px; height: 56px; border-radius: 50%; border: 0; cursor: pointer; background: var(--pc-accent); color: var(--pc-accent-fg); display: grid; place-items: center; box-shadow: 0 6px 20px rgba(0, 0, 0, .25); position: relative; }
button:focus-visible { outline: 3px solid var(--pc-accent); outline-offset: 3px; }
svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.badge { position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: #e03131; color: #fff; font-size: 12px; font-weight: 700; line-height: 20px; text-align: center; }
.panel { position: absolute; bottom: 68px; right: 0; width: min(400px, calc(100vw - 24px)); height: min(640px, calc(100vh - 110px)); box-shadow: 0 12px 40px rgba(0, 0, 0, .3); border-radius: 14px; }
:host([position="left"]) .panel { right: auto; left: 0; }
.panel[hidden] { display: none; }
/* The host themes the launcher; the chat inside follows it. */
plug-chat { height: 100%; --pc-accent: inherit; --pc-accent-fg: inherit; }
@media (max-width: 480px) {
  .panel { position: fixed; inset: 0; width: auto; height: auto; border-radius: 0; }
  .panel:not([hidden]) ~ button { display: none; }
  plug-chat { --pc-radius: 0; }
  .shut { display: grid !important; }
}
.shut { display: none; position: absolute; top: 10px; right: 54px; width: 36px; height: 36px; background: none; box-shadow: none; color: inherit; z-index: 1; }
`;
const CHAT = '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const OWN = new Set(['position', 'label', 'class', 'style', 'id', 'hidden']);
const FORWARDED = ['plugchat:ready', 'plugchat:unread', 'plugchat:message', 'plugchat:call', 'plugchat:call-join', 'plugchat:invite', 'plugchat:theme'];

// Everything else a host can set on <plug-chat> is handed straight to the chat inside.
const PASSED_ON = ['ui', 'features', 'css', 'strings', 'messageActions', 'headerActions'];

class PlugChatLauncher extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._chat = document.createElement('plug-chat');
    // Properties a host may have set before this class loaded.
    for (const prop of ['getToken', 'actions', 'renderers', ...PASSED_ON]) {
      if (Object.hasOwn(this, prop)) {
        const value = this[prop];
        delete this[prop];
        this._chat[prop] = value;
      }
    }
  }

  set getToken(fn) { this._chat.getToken = fn; }
  get getToken() { return this._chat.getToken; }
  set actions(list) { this._chat.actions = list; }
  get actions() { return this._chat.actions; }
  set renderers(map) { this._chat.renderers = map; }
  get renderers() { return this._chat.renderers; }
  /** The underlying <plug-chat>, for anything not exposed here. */
  get chatElement() { return this._chat; }

  connectedCallback() {
    if (this.shadowRoot.firstChild) return;
    for (const { name, value } of this.attributes) if (!OWN.has(name)) this._chat.setAttribute(name, value);
    const style = document.createElement('style');
    style.textContent = STYLE;

    this._panel = document.createElement('div');
    this._panel.className = 'panel';
    this._panel.hidden = true;
    const shut = document.createElement('button');
    shut.className = 'shut';
    shut.innerHTML = CLOSE;
    shut.setAttribute('aria-label', 'Close chat');
    shut.addEventListener('click', () => this.close());
    this._panel.append(this._chat, shut);

    this._button = document.createElement('button');
    this._button.setAttribute('aria-haspopup', 'dialog');
    this._button.addEventListener('click', () => this.toggle());
    this._badge = document.createElement('span');
    this._badge.className = 'badge';
    this._badge.hidden = true;
    this._render(0);

    this._chat.addEventListener('plugchat:unread', (e) => this._render(e.detail.count));
    for (const type of FORWARDED) {
      this._chat.addEventListener(type, (e) => {
        const copy = new CustomEvent(type, { detail: e.detail, cancelable: e.cancelable });
        if (!this.dispatchEvent(copy)) e.preventDefault();
      });
    }
    this.addEventListener('keydown', (e) => e.key === 'Escape' && !this._panel.hidden && !this._chat.shadowRoot.querySelector('dialog[open]') && this.close());
    this.shadowRoot.append(style, this._panel, this._button);
  }

  _render(count) {
    this._count = count;
    const open = this._panel && !this._panel.hidden;
    const label = this.getAttribute('label') ?? 'Messages';
    this._button.innerHTML = open ? CLOSE : CHAT;
    this._button.setAttribute('aria-expanded', String(!!open));
    this._button.setAttribute('aria-label', open ? `Close ${label}` : count ? `${label}, ${count} unread` : label);
    this._badge.textContent = count > 99 ? '99+' : String(count);
    this._badge.hidden = !count || open;
    this._button.append(this._badge);
  }

  open() {
    this._panel.hidden = false;
    this._render(this._count);
    this._chat._markRead?.();
  }
  close() {
    this._panel.hidden = true;
    this._render(this._count);
    this._button.focus();
  }
  toggle() {
    if (this._panel.hidden) this.open();
    else this.close();
  }
}

for (const prop of PASSED_ON) {
  Object.defineProperty(PlugChatLauncher.prototype, prop, {
    get() { return this._chat[prop]; },
    set(value) { this._chat[prop] = value; },
  });
}

if (!customElements.get('plug-chat-launcher')) customElements.define('plug-chat-launcher', PlugChatLauncher);
export { PlugChatLauncher };
