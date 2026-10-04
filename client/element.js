// <plug-chat> — the drop-in chat UI. A standard custom element, so it works
// the same in React, Vue, Angular, Svelte, server-rendered pages and WebViews.
//
//   <script type="module" src="https://your-host/plugchat/client/element.js"></script>
//   <plug-chat server="https://your-host/plugchat" token-url="/api/chat-token"></plug-chat>
//
// All user-provided text is inserted with textContent, never as HTML.
import { PlugChat } from './plugchat.js';
import { CallManager } from './calls.js';
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
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'),
  star: svg('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>'),
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
const EMOJI = [...'😀😃😄😁😆😅🤣😂🙂😉😊😇🥰😍😘😋😜🤪🤗🤔🤨😐😏😒🙄😬😌😴🤒🤯🥳😎😢😭😤😡🤬😱😳🥺🤝👍👎👏🙌🙏💪👌✌🤞👋👀💯🔥✨🎉🎂🎁🏆⚽🎵📌📎📷📞💬💡✅❌❓❗⏰📅💰🛒🚀🚗🏠🌍☀🌧⭐🌹🍀🍕🍔☕🍺❤🧡💛💚💙💜🖤💔'];
const INLINE_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const PLAYABLE = /^(audio\/(webm|ogg|mpeg|mp4|wav|x-wav|aac)|video\/(mp4|webm))$/;
const TIMERS = [[0, 'Off'], [60, '1 minute'], [3600, '1 hour'], [86400, '1 day'], [604800, '1 week']];
const REPORT_REASONS = ['Spam', 'Harassment or bullying', 'Scam or fraud', 'Inappropriate content', 'Something else'];

const STYLE = `
:host {
  color-scheme: light; --pc-accent: #3b5bdb; --pc-accent-fg: #fff;
  --pc-bg: #fff; --pc-surface: #f5f6f8; --pc-fg: #16181d; --pc-muted: #6b7280;
  --pc-border: #e3e5ea; --pc-bubble: #eceef2; --pc-danger: #c92a2a; --pc-radius: 14px;
  display: block; height: 600px; container-type: inline-size;
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--pc-fg);
}
:host([theme="dark"]) {
  color-scheme: dark; --pc-accent: #748ffc; --pc-accent-fg: #0b0d12; --pc-bg: #14161b; --pc-surface: #1b1e25; --pc-fg: #e8eaee;
  --pc-muted: #9199a6; --pc-border: #2a2e37; --pc-bubble: #262a33; --pc-danger: #ff8787;
}
@media (prefers-color-scheme: dark) {
  :host(:not([theme="light"])) {
    color-scheme: dark; --pc-accent: #748ffc; --pc-accent-fg: #0b0d12; --pc-bg: #14161b; --pc-surface: #1b1e25; --pc-fg: #e8eaee;
    --pc-muted: #9199a6; --pc-border: #2a2e37; --pc-bubble: #262a33; --pc-danger: #ff8787;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.root { display: flex; height: 100%; background: var(--pc-bg); border: 1px solid var(--pc-border); border-radius: var(--pc-radius); overflow: hidden; position: relative; }
svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 2px; }
.icon { display: inline-grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; color: var(--pc-muted); flex: none; }
.icon:hover { background: var(--pc-surface); color: var(--pc-fg); }
.icon.on { color: var(--pc-accent); }
.icon.rec { color: #fff; background: var(--pc-danger); }
input[type="text"], input[type="search"], input[type="password"], input[type="datetime-local"], select { font: inherit; color: inherit; background: var(--pc-surface); border: 1px solid var(--pc-border); border-radius: 10px; padding: 8px 12px; width: 100%; min-width: 0; }

.side { width: 300px; flex: none; display: flex; flex-direction: column; border-inline-end: 1px solid var(--pc-border); min-width: 0; }
.bar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; min-height: 58px; border-bottom: 1px solid var(--pc-border); }
.bar h2 { margin: 0; font-size: 17px; flex: 1; }
.find { padding: 8px 10px 2px; }
.stories { display: flex; gap: 10px; padding: 10px 12px 6px; overflow-x: auto; flex: none; }
.story { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 54px; flex: none; font-size: 11px; color: var(--pc-muted); }
.story span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ring { padding: 2px; border-radius: 50%; border: 2px solid var(--pc-border); }
.ring.new { border-color: var(--pc-accent); }
.list { overflow-y: auto; flex: 1; padding: 6px; }
.section { font-size: 12px; font-weight: 600; color: var(--pc-muted); padding: 10px 8px 4px; text-transform: uppercase; letter-spacing: .04em; }
.linkrow { width: 100%; text-align: start; padding: 8px; color: var(--pc-accent); font-size: 13px; border-radius: 10px; }
.linkrow:hover { background: var(--pc-surface); }
.conv { display: flex; gap: 10px; align-items: center; width: 100%; text-align: start; padding: 9px 8px; border-radius: 10px; }
.conv:hover { background: var(--pc-surface); }
.conv[aria-current="true"] { background: color-mix(in srgb, var(--pc-accent) 14%, transparent); }
.conv .body { flex: 1; min-width: 0; }
.line { display: flex; gap: 6px; align-items: center; }
.line svg { width: 13px; height: 13px; color: var(--pc-muted); }
.name { font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.when { font-size: 12px; color: var(--pc-muted); flex: none; }
.preview { color: var(--pc-muted); font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { background: var(--pc-accent); color: var(--pc-accent-fg); border-radius: 10px; font-size: 11px; font-weight: 700; padding: 1px 7px; flex: none; }
.badge.quiet { background: var(--pc-muted); }
.avatar { width: 40px; height: 40px; border-radius: 50%; flex: none; display: grid; place-items: center; font-weight: 600; color: #fff; position: relative; background-size: cover; background-position: center; font-size: 15px; }
.avatar.sm { width: 28px; height: 28px; font-size: 11px; }
.avatar .dot { position: absolute; inset-inline-end: -1px; bottom: -1px; width: 12px; height: 12px; border-radius: 50%; background: #2f9e44; border: 2px solid var(--pc-bg); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.bubble:focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 2px; }
.hint { color: var(--pc-muted); text-align: center; padding: 28px 16px; }

.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.main > .hint { margin: auto; }
.bar .title { flex: 1; min-width: 0; }
.bar .sub { font-size: 12px; color: var(--pc-muted); display: flex; align-items: center; gap: 4px; }
.bar .sub svg { width: 12px; height: 12px; }
.backbtn { display: none; }
.pinbar { display: flex; gap: 8px; align-items: center; padding: 6px 14px; border-bottom: 1px solid var(--pc-border); font-size: 13px; width: 100%; text-align: start; color: var(--pc-muted); }
.pinbar span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pinbar svg { width: 15px; height: 15px; color: var(--pc-accent); }
.msgs { flex: 1; overflow-y: auto; padding: 14px 14px 6px; display: flex; flex-direction: column; gap: 2px; }
.day, .sys { align-self: center; font-size: 12px; color: var(--pc-muted); background: var(--pc-surface); padding: 3px 10px; border-radius: 10px; margin: 8px 0; }
.more { align-self: center; color: var(--pc-accent); font-size: 13px; padding: 6px 10px; }
.row { display: flex; gap: 8px; align-items: flex-end; max-width: 100%; position: relative; border-radius: 12px; }
.row.first { margin-top: 8px; }
.row.mine { flex-direction: row-reverse; }
.row.flash { background: color-mix(in srgb, var(--pc-accent) 16%, transparent); }
.row .spacer { width: 28px; flex: none; }
.col { display: flex; flex-direction: column; align-items: flex-start; max-width: min(78%, 520px); min-width: 0; }
.mine .col { align-items: flex-end; }
.bubble { background: var(--pc-bubble); padding: 7px 11px; border-radius: 16px; overflow-wrap: anywhere; white-space: pre-wrap; min-width: 0; max-width: 100%; }
.mine .bubble { background: var(--pc-accent); color: var(--pc-accent-fg); }
.bubble.mention { box-shadow: 0 0 0 2px var(--pc-accent); }
.bubble a { color: inherit; }
.bubble.ghost { background: none; border: 1px dashed var(--pc-border); color: var(--pc-muted); font-style: italic; }
.sender { font-size: 12px; font-weight: 600; color: var(--pc-accent); margin-bottom: 2px; }
.tag { font-size: 11px; opacity: .75; display: flex; align-items: center; gap: 4px; margin-bottom: 2px; font-style: italic; }
.tag svg { width: 12px; height: 12px; }
button.sender { display: block; text-align: start; }
button.sender:hover, .namebtn:hover { text-decoration: underline; }
.namebtn { flex: 1; text-align: start; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.linkbtn { color: var(--pc-accent); font-size: 12px; padding: 2px 4px; flex: none; }
button.quote { display: block; text-align: start; color: inherit; }
.quote { font-size: 12px; opacity: .8; border-inline-start: 3px solid currentColor; padding: 1px 8px; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
.meta { font-size: 11px; opacity: .7; margin-inline-start: 8px; float: inline-end; margin-top: 4px; display: inline-flex; gap: 4px; align-items: center; white-space: nowrap; }
.meta svg { width: 11px; height: 11px; }
.pic { display: block; max-width: 240px; max-height: 240px; border-radius: 10px; margin-bottom: 4px; }
audio, video.media { display: block; max-width: 260px; margin-bottom: 4px; border-radius: 10px; }
.file { display: flex; gap: 8px; align-items: center; text-decoration: underline; margin-bottom: 2px; text-align: start; }
.once { display: flex; gap: 8px; align-items: center; font-weight: 600; }
.poll { display: flex; flex-direction: column; gap: 6px; min-width: 200px; white-space: normal; }
.poll .q { font-weight: 600; }
.poll small { opacity: .75; }
.opt { position: relative; display: flex; gap: 8px; text-align: start; padding: 6px 10px; border-radius: 10px; overflow: hidden; background: color-mix(in srgb, currentColor 10%, transparent); }
.opt.on { box-shadow: inset 0 0 0 2px currentColor; }
.opt .fill { position: absolute; inset-block: 0; inset-inline-start: 0; background: color-mix(in srgb, currentColor 18%, transparent); }
.opt .lbl { flex: 1; position: relative; }
.opt .cnt { position: relative; font-weight: 600; }
.reacts { display: flex; gap: 4px; flex-wrap: wrap; margin: 2px 0 4px; }
.react { border: 1px solid var(--pc-border); background: var(--pc-bg); border-radius: 12px; padding: 0 7px; font-size: 13px; line-height: 22px; }
.react.on { border-color: var(--pc-accent); background: color-mix(in srgb, var(--pc-accent) 14%, var(--pc-bg)); }
.acts { display: none; align-items: center; background: var(--pc-bg); border: 1px solid var(--pc-border); border-radius: 18px; padding: 2px; align-self: center; flex: none; flex-wrap: wrap; max-width: 190px; }
.row:hover .acts, .row.active .acts, .row:focus-within .acts { display: flex; }
.acts .icon { width: 28px; height: 28px; }
.acts svg { width: 16px; height: 16px; }
.acts .emoji { font-size: 17px; width: 28px; height: 28px; border-radius: 50%; }
.acts .emoji:hover { background: var(--pc-surface); }
.acts .danger:hover { color: var(--pc-danger); }
.typing { min-height: 20px; padding: 0 16px; font-size: 12px; color: var(--pc-muted); }
.emojis { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; max-height: 210px; overflow-y: auto; width: min(300px, 80vw); }
.emojis .emoji { font-size: 20px; width: 34px; height: 34px; border-radius: 8px; }
.emojis .emoji:hover { background: var(--pc-surface); }
.media { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; max-height: 60vh; overflow-y: auto; }
.media .item { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; min-width: 0; }
.media .pic { max-width: 100%; max-height: 110px; margin: 0; }
.media audio, .media video.media { max-width: 100%; }
.bubble a.card { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; padding: 8px 10px; border-inline-start: 3px solid currentColor; border-radius: 8px; background: color-mix(in srgb, currentColor 10%, transparent); text-decoration: none; white-space: normal; max-width: 320px; }
.card small, .card span { opacity: .8; font-size: 12px; }
.notice { display: flex; gap: 8px; align-items: center; padding: 8px 14px; font-size: 13px; background: color-mix(in srgb, #f08c00 18%, var(--pc-bg)); border-bottom: 1px solid var(--pc-border); }
.notice span:nth-child(2) { flex: 1; }
.notice svg { width: 16px; height: 16px; }
.newline { display: flex; align-items: center; gap: 10px; color: var(--pc-accent); font-size: 12px; font-weight: 600; margin: 8px 0; }
.newline::before, .newline::after { content: ""; flex: 1; height: 1px; background: var(--pc-accent); opacity: .5; }
.bubble.pending { opacity: .65; }
.failed { color: var(--pc-danger); font-size: 12px; margin: 2px 0 4px; }
.tobottom { position: absolute; inset-inline-end: 16px; bottom: calc(100% + 30px); min-width: 38px; height: 38px; padding: 0 10px; border-radius: 19px; background: var(--pc-bg); border: 1px solid var(--pc-border); box-shadow: 0 4px 14px rgba(0, 0, 0, .18); font-weight: 600; z-index: 1; }
.menu .sel { background: var(--pc-surface); }
.main.drop { outline: 2px dashed var(--pc-accent); outline-offset: -6px; }
.pic { cursor: zoom-in; }
img.full { max-width: 100%; max-height: 70vh; border-radius: 8px; align-self: center; }
.banner { display: flex; align-items: center; gap: 8px; padding: 6px 14px; border-top: 1px solid var(--pc-border); font-size: 13px; color: var(--pc-muted); }
.banner span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.banner .icon { width: 26px; height: 26px; }
.composer { display: flex; gap: 4px; align-items: flex-end; padding: 10px 12px; border-top: 1px solid var(--pc-border); position: relative; }
.menu { position: absolute; inset-inline-start: 10px; bottom: calc(100% - 4px); background: var(--pc-bg); border: 1px solid var(--pc-border); border-radius: 12px; padding: 4px; display: flex; flex-direction: column; min-width: 190px; box-shadow: 0 6px 24px rgba(0, 0, 0, .18); z-index: 2; }
.menu button { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 8px; text-align: start; }
.menu button:hover { background: var(--pc-surface); }
.menu svg { width: 18px; height: 18px; color: var(--pc-muted); }
textarea { flex: 1; resize: none; border: 1px solid var(--pc-border); border-radius: 18px; padding: 8px 14px; font: inherit; color: inherit; background: var(--pc-surface); max-height: 120px; min-height: 38px; min-width: 0; }
.sendbtn { background: var(--pc-accent); color: var(--pc-accent-fg); }
.sendbtn:hover { background: var(--pc-accent); color: var(--pc-accent-fg); filter: brightness(1.1); }
.sendbtn:disabled { opacity: .45; cursor: default; }
.error { color: var(--pc-danger); font-size: 13px; padding: 4px 14px; }

dialog { border: 1px solid var(--pc-border); border-radius: var(--pc-radius); background: var(--pc-bg); color: var(--pc-fg); padding: 0; width: min(400px, calc(100% - 24px)); max-height: 88%; }
dialog::backdrop { background: rgba(0, 0, 0, .45); }
dialog form, dialog .panel { display: flex; flex-direction: column; gap: 10px; padding: 16px; }
dialog h3 { margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px; }
dialog h3 span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
dialog textarea { border-radius: 10px; min-height: 80px; flex: none; }
.people { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; flex: none; }
.person { display: flex; gap: 10px; align-items: center; padding: 6px 4px; border-radius: 8px; cursor: pointer; width: 100%; text-align: start; }
.person:hover { background: var(--pc-surface); }
.person span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.person small { color: var(--pc-muted); }
.check { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
.check small { color: var(--pc-muted); display: block; }
.btn { background: var(--pc-accent); color: var(--pc-accent-fg); border-radius: 10px; padding: 9px 14px; font-weight: 600; text-align: center; }
.btn:disabled { opacity: .45; cursor: default; }
.btn.plain { background: var(--pc-surface); color: var(--pc-fg); }
.btn.warn { background: none; color: var(--pc-danger); border: 1px solid var(--pc-border); }
.inline { display: flex; gap: 8px; align-items: center; }
.code { font: 600 16px/1.6 ui-monospace, Consolas, monospace; letter-spacing: 1px; background: var(--pc-surface); padding: 10px; border-radius: 10px; text-align: center; }
label.field, .field { font-size: 13px; color: var(--pc-muted); display: flex; flex-direction: column; gap: 4px; }
.storyview { min-height: 240px; display: grid; place-items: center; background: var(--pc-surface); border-radius: 10px; padding: 16px; text-align: center; font-size: 17px; overflow-wrap: anywhere; white-space: pre-wrap; gap: 10px; }
.storyview img { max-width: 100%; max-height: 300px; border-radius: 8px; }
.steps { display: flex; gap: 3px; }
.steps i { flex: 1; height: 3px; border-radius: 2px; background: var(--pc-border); }
.steps i.on { background: var(--pc-accent); }

.call { position: absolute; inset: 0; background: #0d0f13; color: #fff; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
.call iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #000; }
.call video.remote { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.call video.local { position: absolute; inset-inline-end: 14px; top: 14px; width: 28%; max-width: 160px; border-radius: 10px; background: #000; }
.call .cinfo { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; text-shadow: 0 1px 3px #000; }
.call .cinfo .avatar { width: 72px; height: 72px; font-size: 26px; }
.call .cbtns { position: absolute; bottom: 22px; display: flex; gap: 14px; }
.call .cbtns button { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, .18); color: #fff; }
.call .cbtns .off { background: #fff; color: #111; }
.call .cbtns .hang { background: #e03131; }
.call .cbtns .ok { background: #2f9e44; }

.root[dir="rtl"] .backbtn svg, .root[dir="rtl"] .tag svg, .root[dir="rtl"] .sendbtn svg { transform: scaleX(-1); }
@container (max-width: 640px) {
  .side { width: 100%; border-inline-end: 0; }
  .main { display: none; }
  .root.open .side { display: none; }
  .root.open .main { display: flex; }
  .backbtn { display: inline-grid; }
}
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
    this._maybeStart();
  }

  disconnectedCallback() {
    document.removeEventListener('visibilitychange', this._onVisible);
    this.calls?.close();
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
    this.$main = h('section', { class: 'main' }, h('div', { class: 'hint' }, T('Select a conversation to start chatting.')));
    const runSearch = debounce(() => this._search(), 250);
    this.$root = h('div', { class: 'root' },
      h('aside', { class: 'side' },
        h('div', { class: 'bar' },
          (this.$heading = h('h2', {}, this.getAttribute('heading') ?? T('Chats'))),
          h('button', { class: 'icon', icon: 'gear', title: T('Settings'), 'aria-label': T('Settings'), onclick: () => this._settingsDialog() }),
          h('button', { class: 'icon', icon: 'plus', title: T('New chat'), 'aria-label': T('New chat'), onclick: () => this._newChatDialog() }),
        ),
        h('div', { class: 'find' }, h('input', { type: 'search', placeholder: T('Search chats and messages'), 'aria-label': T('Search chats and messages'),
          oninput: (e) => {
            this.query = e.target.value;
            this._renderList();
            runSearch();
          } })),
        this.$stories,
        this.$list,
      ),
      this.$main,
    );
    this.$root.dir = this._dir;
    this.$dialog = h('dialog', { dir: this._dir });
    this.$dialog.addEventListener('click', (e) => e.target === this.$dialog && this.$dialog.close());
    // Clicking anywhere else puts the pop-up menus away.
    this.shadowRoot.addEventListener('click', (e) => {
      if (e.target.closest('.menu, .composer > .icon')) return;
      for (const menu of this.shadowRoot.querySelectorAll('.composer > .menu')) menu.hidden = true;
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
  _avatar(name, url, { small = false, online = false } = {}) {
    const el = h('div', { class: `avatar${small ? ' sm' : ''}`, 'aria-hidden': 'true' });
    if (url && /^https?:\/\//.test(url)) el.style.backgroundImage = `url("${encodeURI(url)}")`;
    else el.textContent = initials(name);
    el.style.backgroundColor = `hsl(${hue(name)} 45% 45%)`;
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
    return m.text || (m.file ? `📎 ${m.file.name}` : '');
  }
  _preview(conv, m) {
    if (!m) return conv.encrypted ? T('Encrypted conversation') : T('No messages yet');
    const who = m.kind === 'system' ? '' : m.senderId === this.chat.me.id ? T('You: ') : conv.type === 'group' ? `${first(this._memberName(conv, m.senderId))}: ` : '';
    return who + this._snippet(m);
  }

  // ---- conversation list, search, stories ----

  _renderList() {
    if (!this.chat?.me) return;
    const q = this.query.trim().toLowerCase();
    const all = [...this.convs.values()];
    const archived = all.filter((c) => c.archived);
    const shown = (q ? all.filter((c) => this._title(c).toLowerCase().includes(q)) : this.showArchived ? archived : all.filter((c) => !c.archived))
      .sort((a, b) => b.pinned - a.pinned || b.updatedAt - a.updatedAt);

    const nodes = [];
    if (!q && this.showArchived) nodes.push(h('button', { class: 'linkrow', onclick: () => ((this.showArchived = false), this._renderList()) }, T('← Back to chats')));
    for (const c of shown) {
      const other = c.type === 'dm' ? this._other(c) : null;
      const title = this._title(c);
      nodes.push(h('button', { class: 'conv', role: 'listitem', 'aria-current': String(c.id === this.activeId), onclick: () => this._select(c.id) },
        this._avatar(title, other?.avatar, { online: !!other && this.chat.online.has(other.userId) }),
        h('div', { class: 'body' },
          h('div', { class: 'line' },
            h('span', { class: 'name' }, title),
            c.pinned && h('span', { icon: 'pin', title: T('Pinned') }),
            c.muted && h('span', { icon: 'mute', title: T('Muted') }),
            c.lastMessage && h('span', { class: 'when' }, shortWhen(c.lastMessage.createdAt)),
          ),
          h('div', { class: 'line' },
            h('span', { class: 'preview' }, c.id !== this.activeId && this._draft(c.id) ? T('Draft: {text}', { text: this._draft(c.id) }) : this._preview(c, c.lastMessage)),
            c.unread > 0 && c.id !== this.activeId && h('span', { class: `badge${c.muted ? ' quiet' : ''}`, 'aria-label': T('{n} unread', { n: c.unread }) }, c.unread > 99 ? '99+' : String(c.unread)),
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
          this._avatar(this._title(c), null, { small: true }),
          h('div', { class: 'body' },
            h('div', { class: 'line' }, h('span', { class: 'name' }, this._title(c)), h('span', { class: 'when' }, shortWhen(m.createdAt))),
            h('div', { class: 'line' }, h('span', { class: 'preview' }, `${first(this._memberName(c, m.senderId))}: ${m.text}`)),
          )));
      }
    }
    if (!nodes.length) nodes.push(h('div', { class: 'hint' }, q ? T('Nothing found.') : T('No conversations yet. Press + to start one.')));
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
    this.activeId = id;
    this._below = 0;
    this._mention = null;
    this.replyTo = this.editing = this.pendingFile = null;
    this.pendingMore = [];
    this.viewOnce = false;
    this.pins = [];
    this.opened.clear();
    this._stopRecording(true);
    this.$root.classList.toggle('open', !!id);
    this._renderList();
    if (!id) return fill(this.$main, h('div', { class: 'hint' }, T('Select a conversation to start chatting.')));

    this.$header = h('div', { class: 'bar' });
    this.$pins = h('button', { class: 'pinbar', hidden: true });
    this.$notice = h('div', { class: 'notice', hidden: true, role: 'status' });
    this.$msgs = h('div', { class: 'msgs', role: 'log' });
    // Screen readers hear each new message once, from here, instead of the whole thread being re-read.
    this.$live = h('div', { class: 'sr', 'aria-live': 'polite' });
    this.$typing = h('div', { class: 'typing' });
    this.$error = h('div', { class: 'error', hidden: true, role: 'alert' });
    this.$banner = h('div', { class: 'banner', hidden: true });
    this.$input = h('textarea', { rows: '1', placeholder: T('Message'), 'aria-label': T('Message'),
      oninput: () => (this._onInput(), this._mentionLookup()),
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
    this.$menu = h('div', { class: 'menu', hidden: true, role: 'menu' });
    this.$mic = h('button', { class: 'icon', icon: 'mic', type: 'button', title: T('Record a voice note'), 'aria-label': T('Record a voice note'),
      hidden: !(navigator.mediaDevices && globalThis.MediaRecorder), onclick: () => this._toggleRecording() });
    this.$send = h('button', { class: 'icon sendbtn', icon: 'send', type: 'submit', title: T('Send'), 'aria-label': T('Send'), disabled: true });
    this.$composer = h('form', { class: 'composer', onsubmit: (e) => (e.preventDefault(), this._submit()) },
      this.$file, this.$menu, this.$mentions, this.$toBottom, this.$emoji,
      h('button', { class: 'icon', icon: 'plus', type: 'button', title: T('Attach'), 'aria-label': T('Attach'), 'aria-haspopup': 'menu', onclick: () => this._toggleMenu() }),
      h('button', { class: 'icon', icon: 'smile', type: 'button', title: T('Emoji'), 'aria-label': T('Emoji'), onclick: () => (this.$emoji.hidden = !this.$emoji.hidden) }),
      this.$input, this.$mic, this.$send,
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
    // The host's own call vendor handles groups too; built-in peer-to-peer calls are one-to-one.
    const canCall = this._on('calls') && (this._external() || (other && this.calls));
    const seen = other && this.lastSeen.get(other.userId);
    const status = other ? (this.chat.online.has(other.userId) ? T('Online') : seen ? T('Last seen {when}', { when: shortWhen(seen) }) : T('Offline')) : T('{n} members', { n: conv.members.length }) + (conv.announce ? T(' · announcements') : '');
    fill(this.$header, 
      h('button', { class: 'icon backbtn', icon: 'back', title: T('Back'), 'aria-label': T('Back to conversations'), onclick: () => this._select(null) }),
      this._avatar(this._title(conv), other?.avatar, { online: !!other && this.chat.online.has(other.userId) }),
      h('div', { class: 'title' },
        h('div', { class: 'name' }, this._title(conv)),
        h('div', { class: 'sub' },
          conv.encrypted && h('span', { icon: 'lock', title: T('End-to-end encrypted') }),
          conv.ttlSeconds && h('span', { icon: 'timer', title: T('Disappearing messages are on') }),
          h('span', {}, conv.encrypted ? T('End-to-end encrypted · {status}', { status }) : status),
        ),
      ),
      canCall && h('button', { class: 'icon', icon: 'phone', title: T('Voice call'), 'aria-label': T('Voice call'), onclick: () => this._call(conv, other, false) }),
      canCall && h('button', { class: 'icon', icon: 'video', title: T('Video call'), 'aria-label': T('Video call'), onclick: () => this._call(conv, other, true) }),
      h('button', { class: 'icon', icon: 'info', title: T('Conversation details'), 'aria-label': T('Conversation details'), onclick: () => this._detailsDialog(conv) }),
    );
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
    const conv = this.convs.get(this.activeId);
    if (!conv || !this.$typing) return;
    const names = [...(this.typing.get(conv.id)?.keys() ?? [])].map((id) => first(this._memberName(conv, id)));
    this.$typing.textContent = names.length === 0 ? '' : names.length === 1 ? T('{name} is typing…', { name: names[0] }) : T('{names} are typing…', { names: names.join(', ') });
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
    if (state.more) nodes.push(h('button', { class: 'more', onclick: () => this._guard(this._loadOlder()) }, T('Load earlier messages')));
    if (!state.list.length) nodes.push(h('div', { class: 'hint' }, conv.encrypted ? T('Messages here are end-to-end encrypted. Say hello.') : T('No messages yet. Say hello.')));

    let prev = null;
    let divided = false;
    for (const m of state.list) {
      const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
      if (newDay) nodes.push(h('div', { class: 'day' }, dayLabel(m.createdAt)));
      // A line where this person stopped reading last time.
      if (state.unreadFrom != null && !divided && m.seq > state.unreadFrom && m.senderId !== me) {
        divided = true;
        nodes.push(h('div', { class: 'newline', role: 'separator' }, T('New messages')));
      }
      if (m.kind === 'system') {
        nodes.push(h('div', { class: 'sys' }, m.text));
        prev = null;
        continue;
      }
      const mine = m.senderId === me;
      const isFirst = newDay || !prev || prev.senderId !== m.senderId || m.createdAt - prev.createdAt > 5 * 60_000;
      const showAvatars = conv.type === 'group' && !mine;
      const name = this._memberName(conv, m.senderId);

      let bubble;
      if (m.deleted) bubble = h('div', { class: 'bubble ghost' }, T('Message deleted'));
      else if (m.undecryptable) bubble = h('div', { class: 'bubble ghost' }, T('Waiting for this device to receive the key for this message.'));
      else {
        const parent = m.replyTo && byId.get(m.replyTo);
        bubble = h('div', { class: `bubble${m.mentions?.includes(me) ? ' mention' : ''}` },
          showAvatars && isFirst && h('button', { class: 'sender', onclick: () => this._profileDialog(m.senderId) }, name),
          m.forwarded && h('div', { class: 'tag' }, h('span', { icon: 'forward' }), T('Forwarded')),
          m.replyTo && h('button', { class: 'quote', onclick: () => this._jumpTo(m.replyTo) }, parent ? `${this._memberName(conv, parent.senderId)}: ${this._snippet(parent)}` : T('Earlier message')),
          this._content(m, conv, mine),
          h('span', { class: 'meta' },
            m.starred && h('span', { icon: 'star', title: T('Starred') }),
            m.pinned && h('span', { icon: 'pin', title: T('Pinned') }),
            m.expiresAt && h('span', { icon: 'timer', title: T('Disappearing message') }),
            m.editedAt && T('edited ·'),
            m.pending && !m.failed ? T('Sending…') : clock(m.createdAt),
            mine && !m.pending && h('span', { title: m.seq <= othersRead ? T('Read') : T('Sent') }, m.seq <= othersRead ? '✓✓' : '✓'),
          ),
        );
        if (m.pending) bubble.classList.add('pending');
      }

      const reacts = Object.entries(m.reactions ?? {});
      const row = h('div', { class: `row${mine ? ' mine' : ''}${isFirst ? ' first' : ''}`, 'data-id': m.id },
        showAvatars && (isFirst ? this._avatar(name, conv.members.find((x) => x.userId === m.senderId)?.avatar, { small: true }) : h('div', { class: 'spacer' })),
        h('div', { class: 'col' },
          bubble,
          reacts.length > 0 && h('div', { class: 'reacts' }, reacts.map(([emoji, users]) =>
            h('button', {
              class: `react${users.includes(me) ? ' on' : ''}`,
              title: users.map((u) => this._memberName(conv, u)).join(', '),
              onclick: () => this._toggleReaction(m, emoji),
            }, `${emoji} ${users.length}`))),
          m.failed && h('div', { class: 'failed', role: 'alert' }, `${T('Not sent')} · ${m.failed} `,
            h('button', { class: 'linkbtn', onclick: () => this._deliver(m.conversationId, m.content, m.id) }, T('Retry')),
            h('button', { class: 'linkbtn', onclick: () => ((state.list = state.list.filter((x) => x.id !== m.id)), this._renderMessages()) }, T('Discard'))),
        ),
        !m.deleted && !m.undecryptable && !m.pending && this._actions(m, mine, conv),
      );
      // Keyboard users open a message's actions with Enter or Space.
      bubble.tabIndex = 0;
      bubble.addEventListener('keydown', (e) => {
        if (e.target === bubble && (e.key === 'Enter' || e.key === ' ')) (e.preventDefault(), row.classList.toggle('active'));
      });
      bubble.addEventListener('click', (e) => {
        if (e.target.closest('a, button, audio, video')) return;
        for (const el of box.querySelectorAll('.row.active')) if (el !== row) el.classList.remove('active');
        row.classList.toggle('active');
      });
      nodes.push(row);
      prev = m;
    }

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
    this._openDialog(h('div', { class: 'panel' },
      this._dialogTitle(T('Media and files')),
      list.length === 0 && h('div', { class: 'hint' }, T('Nothing has been shared here yet.')),
      h('div', { class: 'media' }, list.map((m) => h('div', { class: 'item' },
        this._attachment(m),
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
    this._openDialog(h('div', { class: 'panel' },
      this._dialogTitle(T('Profile')),
      h('div', { class: 'storyview' },
        this._avatar(user.name, user.avatar, { online: user.online }),
        h('strong', {}, user.name),
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

  _emojiGrid(onPick) {
    return h('div', { class: 'emojis', role: 'listbox', 'aria-label': T('Emoji') },
      EMOJI.map((emoji) => h('button', { type: 'button', class: 'emoji', role: 'option', 'aria-label': emoji, onclick: () => onPick(emoji) }, emoji)));
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
    const note = new Notification(this._title(conv), { body: this._preview(conv, m), tag: conv.id });
    note.onclick = () => {
      window.focus();
      this._select(conv.id);
      note.close();
    };
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
        const fill = h('span', { class: 'fill' });
        fill.style.width = `${total ? Math.round((count / total) * 100) : 0}%`;
        return h('button', { class: `opt${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: () => {
          const picks = m.poll.multi ? (on ? mine.filter((x) => x !== i) : [...mine, i]) : on ? [] : [i];
          this._guard(this.chat.vote(m.id, picks));
        } }, fill, h('span', { class: 'lbl' }, label), h('span', { class: 'cnt' }, String(count)));
      }),
      h('small', {}, `${m.poll.multi ? T('Choose any') : T('Choose one')} · ${total === 1 ? T('1 vote') : T('{n} votes', { n: total })}`),
    );
  }

  _actions(m, mine, conv) {
    const role = this._role(conv);
    const canDelete = mine || (conv.type === 'group' && role !== 'member');
    const canPin = !(conv.announce && role === 'member');
    const plain = m.kind === 'text' && !m.viewOnce;
    const forwardable = !m.viewOnce || this.opened.has(m.id);
    const picker = h('span', { hidden: true }, QUICK_REACTIONS.map((emoji) =>
      h('button', { class: 'emoji', 'aria-label': T('React {emoji}', { emoji }), onclick: () => this._toggleReaction(m, emoji) }, emoji)),
      h('button', { class: 'emoji', title: T('More reactions'), 'aria-label': T('More reactions'), onclick: () => this._openDialog(h('div', { class: 'panel' },
        this._dialogTitle(T('React')), this._emojiGrid((emoji) => (this.$dialog.close(), this._toggleReaction(m, emoji))))) }, '+'));
    const act = (icon, label, onclick, cls = '') => h('button', { class: `icon ${cls}`, icon, title: label, 'aria-label': label, onclick });
    return h('div', { class: 'acts' },
      picker,
      act('smile', T('React'), () => (picker.hidden = !picker.hidden)),
      act('reply', T('Reply'), () => this._setDraftMode({ replyTo: m })),
      m.text && !m.viewOnce && act('copy', T('Copy text'), () => this._guard(navigator.clipboard.writeText(m.text))),
      mine && conv.type === 'group' && act('info', T('Message info'), () => this._infoDialog(m, conv)),
      forwardable && !m.viewOnce && m.kind !== 'call' && act('forward', T('Forward'), () => this._forwardDialog(m)),
      canPin && act('pin', m.pinned ? T('Unpin') : T('Pin'), () => this._guard(m.pinned ? this.chat.unpin(m.id) : this.chat.pin(m.id)), m.pinned ? 'on' : ''),
      mine && plain && act('edit', T('Edit'), () => this._setDraftMode({ editing: m })),
      !mine && act('flag', T('Report'), () => this._reportDialog(m)),
      act('star', m.starred ? T('Unstar') : T('Star'), () => this._guard(m.starred ? this.chat.unstar(m.id) : this.chat.star(m.id)), m.starred ? 'on' : ''),
      canDelete && act('trash', T('Delete'), () => this._guard(this.chat.remove(m.id)), 'danger'),
    );
  }

  _attachment(m) {
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
      const el = m.file.mime.startsWith('audio/') ? h('audio', { controls: true, preload: 'metadata', title: label }) : h('video', { class: 'media', controls: true, preload: 'metadata', playsinline: true, title: label });
      blobUrl().then((u) => (el.src = u), () => {});
      return el;
    }
    const save = async () => {
      const url = URL.createObjectURL(await this.chat.download(m));
      h('a', { href: url, download: m.file.name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    };
    return h('button', { class: 'file', onclick: () => this._guard(save()) }, h('span', { icon: 'file' }), label);
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
    el.style.height = `${Math.min(el.scrollHeight + 2, 120)}px`;
    this.$send.disabled = !el.value.trim() && !this.pendingFile;
    const t = Date.now();
    if (!restoring && el.value && t - (this._typedAt ?? 0) > 2000) {
      this._typedAt = t;
      this.chat.typing(this.activeId);
    }
  }

  /** Queue one or several files (up to 10) to go out with the next send, one message each. */
  _attach(files) {
    const list = (files instanceof File ? [files] : [...(files ?? [])]).slice(0, 10);
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
    this.$toBottom.textContent = this._below ? `↓ ${this._below}` : '↓';
  }

  _toLatest() {
    const state = this.msgs.get(this.activeId);
    if (state?.moreAfter) return (this.msgs.delete(this.activeId), this._select(this.activeId));
    this.$msgs.scrollTop = this.$msgs.scrollHeight;
  }

  _toggleMenu(force) {
    const open = force ?? this.$menu.hidden;
    if (open) {
      const item = (icon, label, onclick) => h('button', { type: 'button', role: 'menuitem', onclick: () => (this._toggleMenu(false), onclick()) }, h('span', { icon }), label);
      fill(this.$menu, 
        item('file', T('Photo or file'), () => this.$file.click()),
        item('poll', T('Poll'), () => this._pollDialog()),
        navigator.geolocation && item('map', T('Share my location'), () => this._shareLocation()),
        item('eye', this.viewOnce ? T('View once: on') : T('View once: off'), () => {
          this.viewOnce = !this.viewOnce;
          this._renderBanner();
        }),
        item('timer', T('Send later'), () => this._scheduleDialog()),
        // Whatever else the host platform offers: send money, share a product, book a slot...
        (this.actions ?? []).map((a) => item(a.icon in ICON ? a.icon : 'plus', a.label, () =>
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

  _renderBanner() {
    const conv = this.convs.get(this.activeId);
    const parts = [];
    if (this.editing) parts.push(T('Editing message'));
    if (this.replyTo) parts.push(T('Replying to {name}: {text}', { name: this._memberName(conv, this.replyTo.senderId), text: this._snippet(this.replyTo) }));
    if (this.pendingFile) parts.push(`📎 ${this.pendingFile.name} (${size(this.pendingFile.size)})${this.pendingMore.length ? ` +${this.pendingMore.length}` : ''}`);
    if (this.viewOnce) parts.push(T('View once'));
    this.$banner.hidden = !parts.length;
    if (!parts.length) return;
    fill(this.$banner, 
      h('span', {}, parts.join(' · ')),
      h('button', { class: 'icon', icon: 'close', title: T('Cancel'), 'aria-label': T('Cancel'), onclick: () => {
        if (this.editing) this.$input.value = '';
        this._setDraftMode(null);
      } }),
    );
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
        text: content.text || (content.file ? `📎 ${content.file.name}` : ''), file: null, replyTo: content.replyTo ?? null,
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

  async _toggleRecording() {
    if (this._rec) return this._stopRecording(false);
    const id = this.activeId;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = (this._rec = new MediaRecorder(stream));
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        for (const t of stream.getTracks()) t.stop();
        if (rec.discard || !chunks.length) return;
        const type = (rec.mimeType || 'audio/webm').split(';')[0];
        const file = new File(chunks, `voice-note.${type.split('/')[1]}`, { type });
        this._guard(this.chat.send(id, { file }));
      };
      rec.start();
      this.$mic.classList.add('rec');
      this.$mic.innerHTML = ICON.stop;
      this.$mic.title = T('Stop and send');
    } catch {
      this._error(T('Microphone permission was denied.'));
    }
  }

  _stopRecording(discard) {
    const rec = this._rec;
    if (!rec) return;
    this._rec = null;
    rec.discard = discard;
    rec.stop();
    if (this.$mic) {
      this.$mic.classList.remove('rec');
      this.$mic.innerHTML = ICON.mic;
      this.$mic.title = T('Record a voice note');
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
    fill(this.$dialog, ...content);
    if (!this.$dialog.open) this.$dialog.showModal();
  }

  _dialogTitle(text) {
    return h('h3', {}, h('span', {}, text), h('button', { class: 'icon', icon: 'close', type: 'button', 'aria-label': T('Close'), onclick: () => this.$dialog.close() }));
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
    this._openDialog(h('form', { onsubmit: async (e) => {
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

    this._openDialog(h('div', { class: 'panel' },
      this._dialogTitle(this._title(conv)),
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

  _storyDialog(group, index = Math.max(0, group.stories.findIndex((s) => !s.seen))) {
    const story = group.stories[index];
    if (!story) return this.$dialog.close();
    const mine = group.user.id === this.chat.me.id;
    if (!story.seen) {
      story.seen = true;
      this.chat.viewStory(story.id).then(() => this._loadStories(), () => {});
    }
    const $view = h('div', { class: 'storyview' });
    if (story.attachment && INLINE_IMAGES.has(story.attachment.mime)) {
      const img = h('img', { alt: T('Story photo') });
      let url = this.blobs.get(story.attachment.fileId);
      if (!url) this.blobs.set(story.attachment.fileId, (url = this.chat.storyFile(story).then((b) => URL.createObjectURL(b))));
      url.then((u) => (img.src = u), () => (img.alt = T('Photo unavailable')));
      $view.append(img);
    }
    if (story.text) $view.append(h('div', {}, linkify(story.text)));
    const go = (i) => () => this._storyDialog(group, i);
    this._openDialog(h('div', { class: 'panel' },
      h('div', { class: 'steps' }, group.stories.map((_, i) => h('i', { class: i <= index ? 'on' : '' }))),
      this._dialogTitle(`${mine ? T('My story') : group.user.name} · ${shortWhen(story.createdAt)}`),
      $view,
      mine && h('small', { class: 'field' }, story.views.length ? T('Seen by {names}', { names: story.views.map((v) => this._knownName(v.userId)).join(', ') }) : T('No views yet')),
      h('div', { class: 'inline' },
        h('button', { class: 'btn plain', disabled: index === 0, onclick: go(index - 1) }, T('Previous')),
        h('button', { class: 'btn plain', disabled: index === group.stories.length - 1, onclick: go(index + 1) }, T('Next')),
        mine && h('button', { class: 'btn plain', onclick: () => this._newStoryDialog() }, T('Add')),
        mine && h('button', { class: 'btn warn', onclick: () => this.chat.deleteStory(story.id).then(() => (this.$dialog.close(), this._loadStories()), (e) => this._error(e.message)) }, T('Delete')),
      ),
    ));
  }

  _knownName(userId) {
    for (const c of this.convs.values()) {
      const m = c.members.find((x) => x.userId === userId);
      if (m) return m.name;
    }
    return T('Someone');
  }

  // ---- personal settings ----

  async _settingsDialog() {
    if (!this.chat?.me) return;
    const $err = h('div', { class: 'error', hidden: true, role: 'alert' });
    const run = (p) => p.catch((e) => {
      $err.textContent = e.message;
      $err.hidden = false;
    });
    const toggle = (label, checked, onchange, hint) => {
      // If the change is refused, the switch goes back to where it was instead of showing a setting that did not take.
      const box = h('input', { type: 'checkbox', checked, onchange: () => run(Promise.resolve().then(() => onchange(box.checked)).catch((e) => {
        box.checked = !box.checked;
        throw e;
      })) });
      return h('label', { class: 'check' }, box, h('span', {}, label, hint && h('small', {}, hint)));
    };
    const privacy = this.chat.me.privacy ?? { readReceipts: true, presence: true };
    const mine = this.chat.identity?.deviceId;
    const devices = mine ? await this.chat.devices().catch(() => []) : [];
    const backup = mine ? await this.chat.backupStatus().catch(() => null) : null;
    const $pass = h('input', { type: 'password', placeholder: T('Passphrase'), 'aria-label': T('Passphrase'), autocomplete: 'off' });
    const download = async () => {
      const blob = new Blob([JSON.stringify(await this.chat.exportMyData(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      h('a', { href: url, download: 'my-chat-data.json' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    };
    this._openDialog(h('div', { class: 'panel' },
      this._dialogTitle(T('Settings')),
      toggle(T('Send read receipts'), privacy.readReceipts, (v) => this.chat.setPrivacy({ readReceipts: v }), T('Others see when you have read their messages.')),
      toggle(T('Show when I am online'), privacy.presence, (v) => this.chat.setPrivacy({ presence: v })),
      globalThis.Notification && toggle(T('Desktop notifications'), this._notifyOn() && Notification.permission === 'granted', async (v) => {
        if (v && (await Notification.requestPermission()) !== 'granted') throw new Error(T('Notifications are blocked in this browser.'));
        localStorage.setItem('plugchat:notify', v ? 'on' : 'off');
      }, T('Show a notification when a message arrives and you are not looking at the chat.')),
      h('button', { class: 'btn plain', onclick: () => this._starredDialog() }, T('Starred messages')),
      devices.length > 0 && h('div', { class: 'field' }, T('Devices that can read your encrypted chats.'),
        h('div', { class: 'people' }, devices.map((d) => h('div', { class: 'person' },
          h('span', {}, d.deviceId === mine ? T('This device') : new Date(d.lastSeen).toLocaleDateString(LOCALE, { dateStyle: 'medium' })),
          d.deviceId !== mine && h('button', { class: 'linkbtn', onclick: (e) => run(this.chat.removeDevice(d.deviceId).then(() => e.target.closest('.person').remove())) }, T('Remove')))))),
      backup && h('div', { class: 'field' }, T('Encrypted chat backup'),
        backup.enabledHere
          ? [h('small', {}, T('Backup is on. Your encrypted chats can be restored with your passphrase.')),
            h('button', { class: 'btn warn', onclick: () => run(this.chat.disableBackup().then(() => this._settingsDialog())) }, T('Turn off and delete backup'))]
          : [h('small', {}, backup.exists ? T('Enter your passphrase to read your encrypted chats on this device.') : T('Choose a long passphrase. Without it the backup cannot be opened, by you or anyone else.')),
            $pass,
            h('button', { class: 'btn', onclick: () => run((backup.exists ? this.chat.restoreBackup($pass.value) : this.chat.enableBackup($pass.value)).then(() => this._settingsDialog())) },
              backup.exists ? T('Restore') : T('Turn on backup'))]),
      h('button', { class: 'btn plain', onclick: () => run(download()) }, T('Download my data')),
      $err,
    ));
  }

  async _starredDialog() {
    const list = await this.chat.starred().catch(() => []);
    this._openDialog(h('div', { class: 'panel' },
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
    const overlay = h('div', { class: 'call', role: 'alertdialog', 'aria-label': T('Incoming call from {name}', { name }) },
      h('div', { class: 'cinfo' }, this._avatar(name), h('strong', {}, name),
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
      $remote, h('div', { class: 'cinfo' }, this._avatar(name), h('strong', {}, name), $state), $local, $btns);
    let muted = false, camera = call.video, ticker;
    const btn = (icon, label, cls, onclick) => h('button', { icon, title: label, 'aria-label': label, class: cls, onclick });
    const render = () => {
      const kind = call.video ? 'video' : 'voice';
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
