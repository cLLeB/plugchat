// The look of <plug-chat>. Patterned on what people already know from the
// messengers on their phones: a chat list with previews and badges, grouped
// bubbles on a tinted backdrop, time and ticks inside the bubble, a rounded
// composer whose main button is a microphone until there is something to send.
//
// Nothing here is fixed. Hosts change colours, fonts, corner radii, border
// widths and sizes with the --pc-* variables, restyle any element through
// ::part(name), pick a layout ("bubbles" or "flat") and a density, or add
// their own CSS. Layout switches to a single pane below 700px of available
// width, whatever the device.

export const STYLE = `
:host {
  color-scheme: light;
  --pc-accent: #2f6fed; --pc-accent-fg: #fff;
  --pc-bg: #fff; --pc-surface: #f1f3f6; --pc-chat: #eef1f5; --pc-fg: #111418; --pc-muted: #667085;
  --pc-border: #e4e7ec; --pc-bubble: #fff; --pc-danger: #d92d20; --pc-online: #12b76a; --pc-radius: 16px;
  /* type */
  --pc-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; --pc-font-size: 15px;
  /* shape */
  --pc-bubble-radius: 18px; --pc-avatar-radius: 50%; --pc-control-radius: 12px; --pc-border-width: 1px;
  /* messages: incoming text colour, and the outgoing bubble (any CSS background, so a gradient works) */
  --pc-bubble-fg: var(--pc-fg); --pc-bubble-out-fg: var(--pc-accent-fg);
  --pc-bubble-out: linear-gradient(135deg, color-mix(in oklab, var(--pc-accent) 86%, #fff), var(--pc-accent) 55%, color-mix(in oklab, var(--pc-accent) 84%, #000));
  /* sizes, and the backdrop behind the messages ("none" for a plain one) */
  --pc-sidebar-width: 340px; --pc-height: 640px; --pc-sender-l: 40%;
  --pc-pattern: radial-gradient(color-mix(in srgb, var(--pc-fg) 6%, transparent) 1px, transparent 1.4px);
  display: block; height: var(--pc-height); container-type: inline-size;
  font: var(--pc-font-size)/1.4 var(--pc-font); color: var(--pc-fg);
}
:host([theme="dark"]) {
  color-scheme: dark; --pc-accent: #3d7bf0; --pc-accent-fg: #fff; --pc-bg: #15181d; --pc-surface: #20242c; --pc-chat: #0e1014;
  --pc-fg: #e9ecf1; --pc-muted: #98a2b3; --pc-border: #2a2f38; --pc-bubble: #232831; --pc-danger: #f97066; --pc-sender-l: 72%;
}
@media (prefers-color-scheme: dark) {
  :host(:not([theme="light"])) {
    color-scheme: dark; --pc-accent: #3d7bf0; --pc-accent-fg: #fff; --pc-bg: #15181d; --pc-surface: #20242c; --pc-chat: #0e1014;
    --pc-fg: #e9ecf1; --pc-muted: #98a2b3; --pc-border: #2a2f38; --pc-bubble: #232831; --pc-danger: #f97066; --pc-sender-l: 72%;
  }
}
* { box-sizing: border-box; scrollbar-width: thin; }
[hidden] { display: none !important; }
.root { display: flex; height: 100%; background: var(--pc-bg); border: var(--pc-border-width) solid var(--pc-border); border-radius: var(--pc-radius); overflow: hidden; position: relative; }
svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; -webkit-tap-highlight-color: transparent; }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, .wave:focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 2px; }
.icon { display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; color: var(--pc-muted); flex: none; }
.icon:hover { background: var(--pc-surface); color: var(--pc-fg); }
.icon.on { color: var(--pc-accent); }
input[type="text"], input[type="search"], input[type="password"], input[type="datetime-local"], select { font: inherit; color: inherit; background: var(--pc-surface); border: 1px solid transparent; border-radius: var(--pc-control-radius); padding: 10px 14px; width: 100%; min-width: 0; }
input:focus, select:focus { border-color: var(--pc-accent); outline: none; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.hint { color: var(--pc-muted); text-align: center; padding: 28px 16px; }
.error { color: var(--pc-danger); font-size: 13px; padding: 4px 14px; }
.badge { background: var(--pc-accent); color: var(--pc-accent-fg); border-radius: 11px; font-size: 12px; font-weight: 700; min-width: 22px; height: 22px; padding: 0 7px; display: inline-grid; place-items: center; flex: none; }
.badge.quiet { background: var(--pc-muted); }
.avatar { width: 40px; height: 40px; border-radius: var(--pc-avatar-radius); flex: none; display: grid; place-items: center; font-weight: 600; color: #fff; position: relative; background-size: cover; background-position: center; font-size: 15px; }
.avatar.sm { width: 28px; height: 28px; font-size: 11px; }
.avatar .dot { position: absolute; inset-inline-end: 0; bottom: 0; width: 13px; height: 13px; border-radius: 50%; background: var(--pc-online); border: 2px solid var(--pc-bg); }
.ticks { display: inline-flex; opacity: .75; }
.ticks svg { width: 16px; height: 16px; stroke-width: 2; }
.ticks.read { opacity: 1; }

/* ---- chat list ---- */
.side { width: var(--pc-sidebar-width); flex: none; display: flex; flex-direction: column; border-inline-end: var(--pc-border-width) solid var(--pc-border); min-width: 0; background: var(--pc-bg); }
.bar { display: flex; align-items: center; gap: 6px; padding: 8px 10px 8px 16px; min-height: 60px; flex: none; }
.bar h2 { margin: 0; font-size: 21px; font-weight: 700; flex: 1; letter-spacing: -.01em; }
.find { padding: 2px 12px 8px; }
.find input { border-radius: 22px; padding: 9px 16px; }
.chips { display: flex; gap: 6px; padding: 0 12px 8px; overflow-x: auto; flex: none; }
.chip { padding: 5px 13px; border-radius: 16px; background: var(--pc-surface); color: var(--pc-muted); font-size: 13px; font-weight: 500; white-space: nowrap; }
.chip[aria-pressed="true"] { background: color-mix(in srgb, var(--pc-accent) 16%, transparent); color: var(--pc-accent); }
.stories { display: flex; gap: 12px; padding: 4px 14px 10px; overflow-x: auto; flex: none; border-bottom: var(--pc-border-width) solid var(--pc-border); }
.story { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 58px; flex: none; font-size: 11px; color: var(--pc-muted); }
.story span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ring { padding: 2px; border-radius: 50%; border: 2px solid var(--pc-border); }
.ring.new { border-color: var(--pc-accent); }
.ring .avatar { width: 46px; height: 46px; }
.list { overflow-y: auto; flex: 1; padding: 4px 6px; }
.section { font-size: 12px; font-weight: 600; color: var(--pc-muted); padding: 12px 10px 4px; text-transform: uppercase; letter-spacing: .04em; }
.linkrow { width: 100%; text-align: start; padding: 10px; color: var(--pc-accent); font-size: 14px; border-radius: 12px; }
.linkrow:hover { background: var(--pc-surface); }
.conv { display: flex; gap: 12px; align-items: center; width: 100%; text-align: start; padding: 9px 10px; border-radius: 12px; }
.conv:hover { background: var(--pc-surface); }
.conv[aria-current="true"] { background: color-mix(in srgb, var(--pc-accent) 13%, transparent); }
.conv > .avatar { width: 48px; height: 48px; font-size: 17px; }
.conv .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.line { display: flex; gap: 6px; align-items: center; min-height: 20px; }
.line svg { width: 14px; height: 14px; color: var(--pc-muted); }
.name { font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.when { font-size: 12px; color: var(--pc-muted); flex: none; }
.preview { color: var(--pc-muted); font-size: 14px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preview.live { color: var(--pc-accent); }
.preview.draft { color: var(--pc-danger); }
.conv.unread .name { font-weight: 700; }
.conv.unread .when { color: var(--pc-accent); font-weight: 600; }
.conv.unread .preview { color: var(--pc-fg); }
.conv .ticks { color: var(--pc-muted); }
.conv .ticks.read { color: var(--pc-accent); }

/* ---- conversation ---- */
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; background: var(--pc-chat); position: relative; }
.main > .hint, .main > slot > .hint { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: 320px; }
.main > .hint svg, .main > slot > .hint svg { width: 56px; height: 56px; stroke-width: 1.2; opacity: .6; }
.main > .bar { background: var(--pc-bg); border-bottom: var(--pc-border-width) solid var(--pc-border); padding-inline-start: 10px; gap: 2px; }
.who { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; text-align: start; padding: 4px 6px; border-radius: 12px; }
.who:hover { background: var(--pc-surface); }
.bar .title { flex: 1; min-width: 0; }
.bar .title .name { display: block; font-weight: 600; font-size: 16px; }
.bar .sub { font-size: 13px; color: var(--pc-muted); display: flex; align-items: center; gap: 4px; overflow: hidden; white-space: nowrap; }
.bar .sub.live { color: var(--pc-accent); }
.bar .sub svg { width: 13px; height: 13px; }
.backbtn { display: none; }
.pinbar { display: flex; gap: 8px; align-items: center; padding: 8px 14px; background: var(--pc-bg); border-bottom: var(--pc-border-width) solid var(--pc-border); font-size: 13px; width: 100%; text-align: start; color: var(--pc-muted); flex: none; }
.pinbar span:nth-child(2) { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pinbar svg { width: 16px; height: 16px; color: var(--pc-accent); }
.notice { display: flex; gap: 8px; align-items: center; padding: 8px 14px; font-size: 13px; background: color-mix(in srgb, #f79009 20%, var(--pc-bg)); border-bottom: var(--pc-border-width) solid var(--pc-border); flex: none; }
.notice span:nth-child(2) { flex: 1; }
.notice svg { width: 16px; height: 16px; }
.msgs { flex: 1; overflow-y: auto; padding: 10px 14px 8px; display: flex; flex-direction: column; gap: 2px; }
.day { position: sticky; top: 4px; z-index: 1; }
.day, .sys { align-self: center; font-size: 12px; font-weight: 500; color: var(--pc-muted); background: var(--pc-bg); box-shadow: 0 1px 2px rgba(16, 24, 40, .1); padding: 4px 12px; border-radius: 12px; margin: 8px 0; text-align: center; max-width: 86%; }
.more { align-self: center; color: var(--pc-accent); font-size: 13px; font-weight: 500; padding: 6px 12px; }
.newline { display: flex; align-items: center; gap: 10px; color: var(--pc-accent); font-size: 12px; font-weight: 600; margin: 8px 0; }
.newline::before, .newline::after { content: ""; flex: 1; height: 1px; background: var(--pc-accent); opacity: .4; }

.row { display: flex; gap: 8px; align-items: flex-end; max-width: 100%; position: relative; border-radius: 12px; }
.row.first { margin-top: 8px; }
.row.mine { flex-direction: row-reverse; }
.row.flash { background: color-mix(in srgb, var(--pc-accent) 16%, transparent); }
.row .spacer { width: 28px; flex: none; }
.col { display: flex; flex-direction: column; align-items: flex-start; max-width: min(76%, 540px); min-width: 0; }
.mine .col { align-items: flex-end; }
.bubble { background: var(--pc-bubble); color: var(--pc-bubble-fg); padding: 7px 12px 8px; border-radius: var(--pc-bubble-radius); overflow-wrap: anywhere; white-space: pre-wrap; min-width: 0; max-width: 100%; box-shadow: 0 1px 1px rgba(16, 24, 40, .08); position: relative; }
.mine .bubble { background: var(--pc-bubble-out); color: var(--pc-bubble-out-fg); }
/* Consecutive messages from one person read as a single block. */
.row:not(.mine):not(.first) .bubble { border-start-start-radius: calc(var(--pc-bubble-radius) / 3); }
.row:not(.mine):not(.last) .bubble { border-end-start-radius: calc(var(--pc-bubble-radius) / 3); }
.row.mine:not(.first) .bubble { border-start-end-radius: calc(var(--pc-bubble-radius) / 3); }
.row.mine:not(.last) .bubble { border-end-end-radius: calc(var(--pc-bubble-radius) / 3); }
.bubble:focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 2px; }
.bubble.mention { box-shadow: 0 0 0 2px color-mix(in srgb, var(--pc-accent) 60%, transparent); }
.bubble a { color: inherit; }
.bubble.ghost { background: none; box-shadow: none; border: 1px dashed var(--pc-border); color: var(--pc-muted); font-style: italic; }
.bubble.pending { opacity: .6; }
.bubble.media { padding: 4px; }
.bubble.media .meta { position: absolute; inset-inline-end: 10px; bottom: 9px; margin: 0; padding: 2px 8px; border-radius: 10px; background: rgba(0, 0, 0, .5); color: #fff; opacity: 1; }
.bubble.media .pic { margin: 0; border-radius: 15px; min-width: 150px; min-height: 100px; object-fit: cover; background: color-mix(in srgb, currentColor 12%, transparent); }
.sender { font-size: 13px; font-weight: 600; color: hsl(var(--h, 220) 62% var(--pc-sender-l)); margin-bottom: 2px; }
button.sender { display: block; text-align: start; }
button.sender:hover, .namebtn:hover { text-decoration: underline; }
.namebtn { flex: 1; text-align: start; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.linkbtn { color: var(--pc-accent); font-size: 13px; font-weight: 500; padding: 2px 4px; flex: none; }
.tag { font-size: 12px; opacity: .75; display: flex; align-items: center; gap: 4px; margin-bottom: 2px; font-style: italic; }
.tag svg { width: 13px; height: 13px; }
.quote { display: block; width: 100%; text-align: start; color: inherit; font-size: 13px; border-inline-start: 3px solid currentColor; background: color-mix(in srgb, currentColor 9%, transparent); border-radius: 6px; padding: 4px 8px; margin: 0 0 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }
.meta { font-size: 11px; opacity: .72; margin-inline-start: 10px; float: inline-end; margin-top: 5px; display: inline-flex; gap: 3px; align-items: center; white-space: nowrap; line-height: 16px; }
.meta svg { width: 12px; height: 12px; }
.meta .ticks svg { width: 16px; height: 16px; }
.pic { display: block; max-width: min(280px, 100%); max-height: 300px; border-radius: 12px; margin-bottom: 4px; cursor: zoom-in; }
video.media { display: block; max-width: min(280px, 100%); margin-bottom: 4px; border-radius: 12px; }
img.full { max-width: 100%; max-height: 70vh; border-radius: 8px; align-self: center; }
.once { display: flex; gap: 8px; align-items: center; font-weight: 600; }
.failed { color: var(--pc-danger); font-size: 12px; margin: 2px 0 4px; }

/* file card */
.filecard { display: flex; gap: 10px; align-items: center; text-align: start; padding: 6px 8px 6px 6px; margin-bottom: 4px; border-radius: 12px; background: color-mix(in srgb, currentColor 9%, transparent); min-width: 200px; max-width: 300px; }
.filecard .ext { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, currentColor 16%, transparent); flex: none; }
.filecard .info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.filecard .info b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.filecard .info small { opacity: .75; font-size: 12px; }
.filecard > svg { width: 18px; height: 18px; opacity: .8; }

/* voice note and audio player */
.voice { display: flex; align-items: center; gap: 10px; min-width: min(250px, 64vw); padding: 2px 0; }
.vplay { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; flex: none; background: color-mix(in srgb, currentColor 16%, transparent); }
.vplay svg { fill: currentColor; stroke: none; width: 20px; height: 20px; }
.vplay:disabled { opacity: .5; cursor: default; }
.vbody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.wave { display: flex; align-items: center; gap: 2px; height: 30px; cursor: pointer; direction: ltr; }
.wave i { flex: 1; min-width: 2px; height: 30%; border-radius: 2px; background: currentColor; opacity: .32; transition: opacity .1s; }
.wave i.on { opacity: 1; }
.vmeta { display: flex; gap: 8px; font-size: 12px; opacity: .78; }
.vname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vspeed { font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 11px; background: color-mix(in srgb, currentColor 16%, transparent); flex: none; }

/* poll */
.poll { display: flex; flex-direction: column; gap: 8px; min-width: min(240px, 60vw); white-space: normal; }
.poll .q { font-weight: 600; }
.poll small { opacity: .75; }
.opt { display: grid; grid-template-columns: auto 1fr auto; column-gap: 8px; row-gap: 4px; align-items: center; text-align: start; }
.opt .radio { width: 18px; height: 18px; border-radius: 50%; border: 2px solid currentColor; opacity: .6; display: grid; place-items: center; }
.opt.on .radio { opacity: 1; }
.opt.on .radio::after { content: ""; width: 9px; height: 9px; border-radius: 50%; background: currentColor; }
.opt .cnt { font-size: 13px; font-weight: 600; }
.opt .track { grid-column: 2 / 4; height: 6px; border-radius: 3px; background: color-mix(in srgb, currentColor 14%, transparent); overflow: hidden; }
.opt .fill { display: block; height: 100%; border-radius: 3px; background: currentColor; transition: width .25s; }

/* reactions sit on the lower edge of the bubble */
.reacts { display: flex; gap: 4px; flex-wrap: wrap; margin: -6px 8px 4px; position: relative; z-index: 1; }
.react { border: var(--pc-border-width) solid var(--pc-border); background: var(--pc-bg); color: var(--pc-fg); border-radius: 13px; padding: 0 8px; font-size: 13px; line-height: 24px; box-shadow: 0 1px 2px rgba(16, 24, 40, .1); }
.react.on { border-color: var(--pc-accent); background: color-mix(in srgb, var(--pc-accent) 16%, var(--pc-bg)); }

/* message actions: two quiet buttons beside the bubble, a menu from them */
.acts { display: flex; gap: 2px; align-self: center; flex: none; position: relative; visibility: hidden; }
.row:hover .acts, .row.active .acts, .row:focus-within .acts { visibility: visible; }
.mini { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: var(--pc-muted); background: var(--pc-bg); box-shadow: 0 1px 2px rgba(16, 24, 40, .14); }
.mini:hover { color: var(--pc-fg); }
.mini svg { width: 17px; height: 17px; }
.pop { position: absolute; bottom: calc(100% + 6px); inset-inline-start: 0; z-index: 3; background: var(--pc-bg); color: var(--pc-fg); border: var(--pc-border-width) solid var(--pc-border); border-radius: 16px; box-shadow: 0 8px 28px rgba(16, 24, 40, .22); }
.mine .pop { inset-inline-start: auto; inset-inline-end: 0; }
.pop.below { bottom: auto; top: calc(100% + 6px); }
.pop.reactions { display: flex; padding: 4px 6px; border-radius: 26px; }
.pop.list, .sheetlist { display: flex; flex-direction: column; padding: 6px; min-width: 200px; }
.pop.list button, .sheetlist button { display: flex; gap: 12px; align-items: center; padding: 9px 12px; border-radius: 10px; text-align: start; white-space: nowrap; }
.pop.list button:hover, .sheetlist button:hover { background: var(--pc-surface); }
.pop.list svg, .sheetlist svg { width: 19px; height: 19px; color: var(--pc-muted); }
.pop .danger, .sheetlist .danger, .pop .danger svg, .sheetlist .danger svg { color: var(--pc-danger); }
.emoji { font-size: 22px; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; }
.emoji:hover { background: var(--pc-surface); }
.quick { display: flex; justify-content: space-between; padding: 2px 4px 8px; border-bottom: var(--pc-border-width) solid var(--pc-border); margin-bottom: 4px; }
@media (hover: none) { .acts { display: none; } }

/* typing bubble */
.typing { min-height: 0; padding: 0 14px 6px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--pc-muted); flex: none; }
.dots { display: inline-flex; gap: 4px; padding: 10px 12px; background: var(--pc-bubble); border-radius: 16px; box-shadow: 0 1px 1px rgba(16, 24, 40, .08); }
.dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--pc-muted); animation: pc-bounce 1.2s infinite ease-in-out; }
.dots i:nth-child(2) { animation-delay: .15s; }
.dots i:nth-child(3) { animation-delay: .3s; }
@keyframes pc-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-4px); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .dots i, .recdot { animation: none !important; } }

/* composer */
.banner { display: flex; align-items: center; gap: 8px; margin: 0 12px; padding: 8px 8px 8px 12px; background: var(--pc-bg); border-radius: 14px 14px 0 0; border-inline-start: 4px solid var(--pc-accent); font-size: 13px; color: var(--pc-muted); flex: none; }
.banner span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.banner .icon { width: 28px; height: 28px; }
.banner .icon svg { width: 16px; height: 16px; }
.composer { display: flex; gap: 6px; align-items: flex-end; padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px)); background: var(--pc-bg); border-top: var(--pc-border-width) solid var(--pc-border); position: relative; flex: none; }
.pill { flex: 1; min-width: 0; display: flex; align-items: flex-end; background: var(--pc-surface); border-radius: 22px; padding: 2px 4px; }
textarea { scrollbar-width: none; flex: 1; resize: none; border: 0; outline: 0; background: none; padding: 10px 6px; font: inherit; color: inherit; max-height: 140px; min-height: 40px; min-width: 0; }
.action { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; flex: none; background: var(--pc-accent); color: var(--pc-accent-fg); transition: transform .12s; }
.action:hover { filter: brightness(1.08); }
.action:active { transform: scale(.94); }
.action:disabled { opacity: .45; cursor: default; }
.rec { display: none; flex: 1; align-items: center; gap: 10px; min-width: 0; height: 44px; padding: 0 6px; background: var(--pc-surface); border-radius: 22px; }
.composer.recording .pill, .composer.recording .attach { display: none; }
.composer.recording .rec { display: flex; }
.rec .trash { color: var(--pc-danger); }
.recdot { width: 10px; height: 10px; border-radius: 50%; background: var(--pc-danger); animation: pc-pulse 1.1s infinite; flex: none; }
@keyframes pc-pulse { 50% { opacity: .25; } }
.rectime { font-variant-numeric: tabular-nums; font-weight: 600; min-width: 38px; }
.rec .wave { flex: 1; height: 26px; cursor: default; justify-content: flex-end; overflow: hidden; }
.rec .wave i { flex: none; width: 3px; opacity: .7; color: var(--pc-accent); background: var(--pc-accent); }
.menu { position: absolute; inset-inline-start: 10px; bottom: calc(100% + 4px); background: var(--pc-bg); border: var(--pc-border-width) solid var(--pc-border); border-radius: 16px; padding: 6px; display: flex; flex-direction: column; min-width: 200px; box-shadow: 0 8px 28px rgba(16, 24, 40, .22); z-index: 2; }
.menu button { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 10px; text-align: start; }
.menu button:hover, .menu .sel { background: var(--pc-surface); }
.menu svg { width: 18px; height: 18px; color: var(--pc-muted); }
/* The grid still scrolls (wheel, touch, keyboard); it just does not draw scroll bars. */
.emojis { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 2px; max-height: 230px; overflow: hidden auto; scrollbar-width: none; width: min(320px, 82vw); }
.emojis::-webkit-scrollbar { display: none; }
.emojis .emoji { border-radius: 10px; width: 100%; height: 38px; }
/* attach sheet: a grid of labelled, coloured circles */
.sheet { position: absolute; inset-inline-start: 10px; bottom: calc(100% + 4px); z-index: 2; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 14px 12px; background: var(--pc-bg); border: var(--pc-border-width) solid var(--pc-border); border-radius: 18px; box-shadow: 0 8px 28px rgba(16, 24, 40, .22); width: min(320px, calc(100% - 20px)); }
.sheet button { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 4px; border-radius: 12px; font-size: 12px; text-align: center; color: var(--pc-fg); }
.sheet button:hover { background: var(--pc-surface); }
.sheet .ic { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; color: #fff; }
.tobottom { position: absolute; inset-inline-end: 14px; bottom: calc(100% + 14px); width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; background: var(--pc-bg); color: var(--pc-muted); box-shadow: 0 3px 12px rgba(16, 24, 40, .22); z-index: 1; }
.tobottom .badge { position: absolute; top: -8px; inset-inline-end: -4px; }
.main.drop { outline: 2px dashed var(--pc-accent); outline-offset: -6px; }
.bubble a.card { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; padding: 8px 10px; border-inline-start: 3px solid currentColor; border-radius: 8px; background: color-mix(in srgb, currentColor 10%, transparent); text-decoration: none; white-space: normal; max-width: 320px; }
.card small, .card span { opacity: .8; font-size: 12px; }

/* ---- dialogs ---- */
dialog { border: var(--pc-border-width) solid var(--pc-border); border-radius: 20px; background: var(--pc-bg); color: var(--pc-fg); padding: 0; width: min(420px, calc(100% - 24px)); max-height: 88%; box-shadow: 0 20px 60px rgba(16, 24, 40, .3); }
dialog::backdrop { background: rgba(8, 12, 20, .5); }
dialog form, dialog .panel { display: flex; flex-direction: column; gap: 12px; padding: 18px; }
dialog h3 { margin: 0; font-size: 18px; display: flex; align-items: center; gap: 8px; }
dialog h3 span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
dialog textarea { border-radius: 12px; min-height: 90px; flex: none; background: var(--pc-surface); padding: 10px 14px; }
.hero { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0 8px; text-align: center; }
.hero .avatar { width: 88px; height: 88px; font-size: 32px; margin-bottom: 6px; }
.hero strong { font-size: 19px; }
.hero small { color: var(--pc-muted); font-size: 13px; }
.lockline { display: inline-flex; align-items: center; gap: 4px; }
.lockline svg { width: 13px; height: 13px; }
.people { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; flex: none; }
.person { display: flex; gap: 10px; align-items: center; padding: 7px 6px; border-radius: 10px; cursor: pointer; width: 100%; text-align: start; }
.person:hover { background: var(--pc-surface); }
.person span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.person small { color: var(--pc-muted); }
.check { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; }
.check small { color: var(--pc-muted); display: block; font-size: 12px; }
.check input { width: 18px; height: 18px; accent-color: var(--pc-accent); margin-top: 1px; }
.btn { background: var(--pc-accent); color: var(--pc-accent-fg); border-radius: var(--pc-control-radius); padding: 11px 16px; font-weight: 600; text-align: center; }
.btn:disabled { opacity: .45; cursor: default; }
.btn.plain { background: var(--pc-surface); color: var(--pc-fg); }
.btn.warn { background: none; color: var(--pc-danger); border: var(--pc-border-width) solid var(--pc-border); }
.inline { display: flex; gap: 8px; align-items: center; }
.code { font: 600 16px/1.6 ui-monospace, Consolas, monospace; letter-spacing: 1px; background: var(--pc-surface); padding: 10px; border-radius: 12px; text-align: center; }
label.field, .field { font-size: 13px; color: var(--pc-muted); display: flex; flex-direction: column; gap: 5px; }
.storyview { min-height: 240px; display: grid; place-items: center; background: var(--pc-surface); border-radius: 14px; padding: 16px; text-align: center; font-size: 17px; overflow-wrap: anywhere; white-space: pre-wrap; gap: 10px; }
.storyview img { max-width: 100%; max-height: 300px; border-radius: 10px; }
.steps { display: flex; gap: 3px; }
.steps i { flex: 1; height: 3px; border-radius: 2px; background: var(--pc-border); }
.steps i.on { background: var(--pc-accent); }
.media { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; max-height: 60vh; overflow-y: auto; }
.media .item { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; min-width: 0; }
.media .pic { max-width: 100%; max-height: 120px; margin: 0; }
.media .voice, .media .filecard { min-width: 0; max-width: 100%; width: 100%; }
.media video.media { max-width: 100%; }

/* ---- pictures ---- */
.avatar.photo-on { background-color: transparent !important; }
.photo { position: relative; border-radius: 50%; }
.photo .cam { position: absolute; inset-inline-end: 0; bottom: 4px; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--pc-accent); color: var(--pc-accent-fg); border: 3px solid var(--pc-bg); }
.photo .cam svg { width: 16px; height: 16px; }
.hero.compact { flex-direction: row; gap: 12px; padding: 0 4px 10px; border-bottom: var(--pc-border-width) solid var(--pc-border); text-align: start; }
.hero.compact .avatar { width: 44px; height: 44px; font-size: 16px; margin: 0; }
.hero.compact strong { font-size: 16px; }
.hero .about { font-size: 14px; color: var(--pc-fg); }

/* ---- what is about to be sent ---- */
.extras { flex: none; background: var(--pc-bg); border-top: var(--pc-border-width) solid var(--pc-border); padding: 8px 12px 0; display: flex; flex-direction: column; gap: 8px; }
.extras + .composer { border-top: 0; }
.extras .banner { margin: 0; border-radius: 10px; background: var(--pc-surface); padding: 6px 6px 6px 12px; }
.bannertext { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.bannertext strong { color: var(--pc-accent); font-size: 13px; }
.bannertext span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tray { display: flex; gap: 8px; align-items: center; overflow-x: auto; padding: 2px 2px 4px; }
.thumb { position: relative; width: 68px; height: 68px; border-radius: 12px; flex: none; background: var(--pc-surface); display: grid; place-items: center; overflow: visible; }
.thumb img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; }
.thumb.doc { padding: 6px; align-content: center; gap: 2px; color: var(--pc-muted); }
.thumb.doc small { font-size: 10px; max-width: 56px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.thumb .x { position: absolute; top: -6px; inset-inline-end: -6px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--pc-fg); color: var(--pc-bg); }
.thumb .x svg { width: 12px; height: 12px; stroke-width: 2.4; }
.thumb.add { border: 2px dashed var(--pc-border); background: none; color: var(--pc-muted); }
.chip.on { background: color-mix(in srgb, var(--pc-accent) 16%, transparent); color: var(--pc-accent); display: inline-flex; align-items: center; gap: 6px; flex: none; }
.chip.on svg { width: 15px; height: 15px; }

/* ---- message text ---- */
.bubble { -webkit-user-select: text; user-select: text; touch-action: pan-y; }
.bubble code { font: 0.92em ui-monospace, Consolas, monospace; background: color-mix(in srgb, currentColor 12%, transparent); padding: 1px 5px; border-radius: 5px; }
.at { font-weight: 600; }
.row:not(.mine) .at { color: var(--pc-accent); }
.bubble.jumbo { background: none !important; box-shadow: none; padding: 0 2px; font-size: 44px; line-height: 1.15; color: var(--pc-fg) !important; }
.bubble.jumbo .meta { font-size: 11px; display: flex; float: none; justify-content: flex-end; margin: 0; }
.row.new .col { animation: pc-in .2s ease-out; }
@keyframes pc-in { from { opacity: 0; transform: translateY(8px) scale(.98); } }

/* ---- appearance switch, connection state, composer details ---- */
.seg { display: flex; gap: 4px; background: var(--pc-bg); border-radius: 12px; padding: 4px; margin: 6px 0 12px; }
.seg button { flex: 1; padding: 8px 6px; border-radius: 9px; font-size: 14px; font-weight: 500; color: var(--pc-muted); }
.seg button[aria-checked="true"] { background: var(--pc-accent); color: var(--pc-accent-fg); }
.net { position: absolute; top: 10px; inset-inline: 0; margin: 0 auto; width: max-content; display: flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 16px; background: var(--pc-fg); color: var(--pc-bg); font-size: 13px; z-index: 6; box-shadow: 0 4px 14px rgba(16, 24, 40, .25); }
.spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid currentColor; border-top-color: transparent; animation: pc-spin .8s linear infinite; }
@keyframes pc-spin { to { transform: rotate(360deg); } }
.pill .icon { width: 38px; height: 38px; margin-bottom: 1px; }
.cambtn { display: none; }
.conv:active, .person:active, .setrow.link:active { background: var(--pc-surface); }
.msgs { background-image: var(--pc-pattern); background-size: 20px 20px; }

/* ---- small confirmations, and the new-chat button on phones ---- */
.toast { position: absolute; inset-inline: 0; bottom: 84px; margin: 0 auto; width: max-content; max-width: 80%; padding: 9px 16px; border-radius: 20px; background: color-mix(in srgb, var(--pc-fg) 92%, transparent); color: var(--pc-bg); font-size: 14px; z-index: 6; box-shadow: 0 6px 20px rgba(16, 24, 40, .25); animation: pc-in .16s ease-out; pointer-events: none; }
.side { position: relative; }
.fab { display: none; position: absolute; inset-inline-end: 16px; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); width: 56px; height: 56px; border-radius: 18px; place-items: center; background: var(--pc-accent); color: var(--pc-accent-fg); box-shadow: 0 6px 18px rgba(16, 24, 40, .3); z-index: 2; }

/* ---- settings and other full screens ---- */
.pageback { display: none; }
.group { display: flex; flex-direction: column; background: var(--pc-surface); border-radius: 14px; padding: 4px 14px; }
.group h4 { margin: 10px 0 2px; font-size: 12px; font-weight: 600; color: var(--pc-accent); text-transform: uppercase; letter-spacing: .05em; }
.setrow { display: flex; align-items: center; gap: 12px; padding: 11px 0; min-height: 48px; text-align: start; width: 100%; border-top: var(--pc-border-width) solid var(--pc-border); }
.group h4 + .setrow, .group .note + .setrow { border-top: 0; }
.setrow:not(.link) > span:first-child, .setrow.link > span:nth-child(2) { flex: 1; min-width: 0; }
.setrow small { display: block; color: var(--pc-muted); font-size: 12px; margin-top: 2px; }
.setrow.link svg { width: 20px; height: 20px; color: var(--pc-muted); }
.setrow.link .go svg { width: 16px; height: 16px; }
.setrow.danger, .setrow.danger svg { color: var(--pc-danger); }
.note { margin: 6px 0; font-size: 13px; color: var(--pc-muted); }
.group .inline { padding-bottom: 10px; }
.group input { background: var(--pc-bg); }
/* switches: every on/off choice looks like the one on a phone */
input[type="checkbox"][role="switch"], .check input[type="checkbox"] { appearance: none; -webkit-appearance: none; width: 44px; height: 26px; border-radius: 13px; background: color-mix(in srgb, var(--pc-muted) 45%, transparent); position: relative; flex: none; cursor: pointer; transition: background .15s; margin: 0; }
input[type="checkbox"][role="switch"]::after, .check input[type="checkbox"]::after { content: ""; position: absolute; top: 3px; inset-inline-start: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .3); transition: transform .15s; }
input[type="checkbox"][role="switch"]:checked, .check input[type="checkbox"]:checked { background: var(--pc-accent); }
input[type="checkbox"][role="switch"]:checked::after, .check input[type="checkbox"]:checked::after { transform: translateX(18px); }
.root[dir="rtl"] input[type="checkbox"]:checked::after, dialog[dir="rtl"] input[type="checkbox"]:checked::after { transform: translateX(-18px); }
input[type="checkbox"]:disabled { opacity: .5; cursor: default; }
.check { align-items: center; justify-content: space-between; flex-direction: row-reverse; }
.check > span { flex: 1; }
.person input[type="checkbox"] { width: 20px; height: 20px; accent-color: var(--pc-accent); }

/* ---- emoji picker ---- */
.emojipicker { display: flex; flex-direction: column; gap: 4px; width: min(336px, 84vw); }
.emojitabs { display: flex; gap: 2px; border-bottom: var(--pc-border-width) solid var(--pc-border); padding-bottom: 4px; overflow: hidden; }
.emojitabs .emoji { flex: 1 1 0; min-width: 0; width: auto; height: 34px; font-size: 18px; border-radius: 10px; opacity: .6; }
.emojitabs .emoji[aria-pressed="true"] { opacity: 1; background: var(--pc-surface); }
.emojipicker .emojis { width: 100%; }
.emojis .hint { grid-column: 1 / -1; font-size: 13px; padding: 20px 8px; }
dialog .emojipicker { width: 100%; }

/* ---- stories, full screen ---- */
.storyfs { position: absolute; inset: 0; z-index: 6; background: #000; color: #fff; display: flex; flex-direction: column; outline: 0; }
.storyfs .steps { position: absolute; top: 8px; inset-inline: 10px; z-index: 2; gap: 4px; }
.storyfs .steps i { height: 3px; background: rgba(255, 255, 255, .35); overflow: hidden; }
.storyfs .steps i b { display: block; height: 100%; width: 0; background: #fff; }
.storyfs .steps i.on b { width: 100%; }
.storyfs .steps i.now b { animation: pc-fill linear forwards; }
@keyframes pc-fill { to { width: 100%; } }
.storyhead { position: absolute; top: 18px; inset-inline: 10px; z-index: 3; display: flex; align-items: center; gap: 8px; text-shadow: 0 1px 3px rgba(0, 0, 0, .6); }
.storyhead strong { font-size: 15px; }
.storyhead small { flex: 1; opacity: .8; font-size: 12px; }
.storyhead .icon { color: #fff; }
.storyhead .icon:hover { background: rgba(255, 255, 255, .18); color: #fff; }
.storybody { flex: 1; display: grid; place-items: center; padding: 70px 24px 60px; text-align: center; overflow: hidden; position: relative; }
.storybody img { max-width: 100%; max-height: 100%; object-fit: contain; grid-area: 1 / 1; }
.storybody p { margin: 0; font-size: clamp(20px, 5cqw, 30px); font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; white-space: pre-wrap; grid-area: 1 / 1; text-shadow: 0 1px 4px rgba(0, 0, 0, .35); }
.storybody p.caption { align-self: end; font-size: 16px; font-weight: 400; background: rgba(0, 0, 0, .5); padding: 8px 14px; border-radius: 12px; }
.storybody a { color: inherit; }
.storyfs .tap { position: absolute; top: 64px; bottom: 60px; width: 34%; z-index: 1; cursor: pointer; }
.storyfs .tap.prev { inset-inline-start: 0; }
.storyfs .tap.next { inset-inline-end: 0; width: 66%; }
.storyfoot { position: absolute; bottom: 0; inset-inline: 0; z-index: 3; display: flex; align-items: center; gap: 6px; padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px)); background: linear-gradient(transparent, rgba(0, 0, 0, .7)); font-size: 13px; }
.storyfoot > span { flex: 1; display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.storyfoot svg { width: 16px; height: 16px; }
.storyfoot .icon { color: #fff; }
.ring.new { border: 0; padding: 3px; background: conic-gradient(from 210deg, var(--pc-accent), #f79009, #e5484d, var(--pc-accent)); }
.ring.new .avatar { box-shadow: 0 0 0 2px var(--pc-bg); }

/* ---- calls ---- */
.call { position: absolute; inset: 0; background: radial-gradient(120% 80% at 50% 0%, #26354f, #0b0e14 70%); color: #fff; z-index: 7; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
.call .cinfo strong { font-size: 24px; font-weight: 600; }
.call .cinfo [role="status"] { opacity: .8; font-variant-numeric: tabular-nums; }
.call.ringing .cinfo .avatar { animation: pc-ring 1.6s ease-out infinite; }
@keyframes pc-ring { 0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, .35), 0 0 0 0 rgba(255, 255, 255, .2); } 100% { box-shadow: 0 0 0 22px rgba(255, 255, 255, 0), 0 0 0 44px rgba(255, 255, 255, 0); } }
@media (prefers-reduced-motion: reduce) { .call.ringing .cinfo .avatar { animation: none; } }
.call iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #000; }
.call video.remote { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.call video.local { position: absolute; inset-inline-end: 14px; top: 14px; width: 28%; max-width: 160px; border-radius: 12px; background: #000; }
.call .cinfo { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; text-shadow: 0 1px 3px #000; }
.call .cinfo .avatar { width: 88px; height: 88px; font-size: 32px; }
.call .cbtns { position: absolute; bottom: 28px; display: flex; gap: 16px; }
.call .cbtns button { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, .18); color: #fff; }
.call .cbtns .off { background: #fff; color: #111; }
.call .cbtns .hang { background: #e03131; }
.call .cbtns .ok { background: #2f9e44; }

.root[dir="rtl"] .backbtn svg, .root[dir="rtl"] .tag svg, .root[dir="rtl"] .action svg { transform: scaleX(-1); }

/* ---- chat list filters: tabs with an underline ---- */
.chips { gap: 2px; padding: 0 12px; overflow: auto hidden; scrollbar-width: none; border-bottom: var(--pc-border-width) solid var(--pc-border); margin-bottom: 4px; }
.chips .chip { background: none; border-radius: 0; padding: 8px 10px; border-bottom: 2px solid transparent; margin-bottom: -1px; font-weight: 600; }
.chips .chip[aria-pressed="true"] { background: none; color: var(--pc-accent); border-bottom-color: var(--pc-accent); }
.stories { padding-top: 8px; }

/* ---- message toolbar: floats over the corner of the message under the pointer ---- */
.col { position: relative; }
.acts { position: absolute; top: -20px; inset-inline-start: 6px; z-index: 2; gap: 0; padding: 2px; align-self: auto; background: var(--pc-bg); border: var(--pc-border-width) solid var(--pc-border); border-radius: 10px; box-shadow: 0 2px 8px rgba(16, 24, 40, .14); }
.mine .acts { inset-inline-start: auto; inset-inline-end: 6px; }
.mini { width: 30px; height: 28px; border-radius: 7px; background: none; box-shadow: none; }
.mini:hover { background: var(--pc-surface); }
.react.add { display: inline-grid; place-items: center; padding: 0 6px; color: var(--pc-muted); }
.react.add svg { width: 15px; height: 15px; }
.reacts .pop { inset-inline-start: 0; inset-inline-end: auto; }
.mine .reacts .pop { inset-inline-start: auto; inset-inline-end: 0; }
/* who has read up to here: their pictures, small, under the message */
.seen { display: flex; gap: 2px; align-self: flex-end; margin: 3px 2px 0; }
.seen .avatar { width: 16px; height: 16px; font-size: 8px; }

/* ---- composer: add on the outside, emoji inside the box ---- */
.composer > .attach { margin-bottom: 2px; }

/* ---- info screens slide in beside the conversation on a wide layout ---- */
dialog.drawer { position: absolute; inset-block: 0; inset-inline: auto 0; margin: 0; width: min(380px, 100%); height: 100%; max-height: 100%; border: 0; border-inline-start: var(--pc-border-width) solid var(--pc-border); border-radius: 0; box-shadow: -12px 0 32px rgba(16, 24, 40, .16); overflow-y: auto; z-index: 5; animation: pc-side .2s ease-out; }

/* ---- layout="flat": no bubbles, everyone on one side, names and pictures on every block ---- */
.root.flat .main { background: var(--pc-bg); }
.root.flat .msgs { background-image: none; padding-inline: 0; gap: 0; }
.root.flat .row, .root.flat .row.mine { flex-direction: row; align-items: flex-start; gap: 10px; padding: 2px 16px; border-radius: 0; }
.root.flat .row.first { margin-top: 0; padding-top: 8px; }
.root.flat .row:hover, .root.flat .row.active { background: color-mix(in srgb, var(--pc-fg) 4%, transparent); }
.root.flat .col, .root.flat .mine .col { align-items: flex-start; max-width: none; flex: 1; }
.root.flat .bubble, .root.flat .mine .bubble { background: none; color: var(--pc-fg); box-shadow: none; padding: 0; border-radius: 0; width: 100%; }
.root.flat .bubble.mention { box-shadow: -3px 0 0 var(--pc-accent); padding-inline-start: 8px; background: color-mix(in srgb, var(--pc-accent) 8%, transparent); }
.root.flat .bubble.ghost { border: 0; }
.root.flat .row > .avatar.sm { width: 36px; height: 36px; font-size: 14px; margin-top: 2px; }
.root.flat .row > .spacer { width: 36px; }
.root.flat .sender { font-size: inherit; }
.root.flat .meta { float: none; margin-inline-start: 8px; vertical-align: baseline; }
.root.flat .bubble.media .meta { position: static; background: none; color: inherit; padding: 0; opacity: .72; }
.root.flat .bubble.media .pic { border-radius: 10px; }
.root.flat .acts, .root.flat .mine .acts { inset-inline-start: auto; inset-inline-end: 4px; top: -16px; }
.root.flat .pop, .root.flat .mine .pop { inset-inline-start: auto; inset-inline-end: 0; }
.root.flat .reacts, .root.flat .mine .reacts { margin: 4px 0; }
.root.flat .reacts .pop, .root.flat .mine .reacts .pop { inset-inline-start: 0; inset-inline-end: auto; }
.root.flat .seen { align-self: flex-start; }
.root.flat .day { position: static; display: flex; align-items: center; gap: 12px; align-self: stretch; max-width: none; margin: 12px 16px 4px; padding: 0; background: none; box-shadow: none; }
.root.flat .day::before, .root.flat .day::after { content: ""; flex: 1; height: 1px; background: var(--pc-border); }
.root.flat .typing { padding-inline: 16px; }

/* ---- density="compact": more on screen ---- */
.root.compact .conv { padding-block: 5px; }
.root.compact .conv > .avatar { width: 36px; height: 36px; font-size: 14px; }
.root.compact .bar { min-height: 48px; }
.root.compact .bubble { padding: 5px 10px 6px; }
.root.compact .row.first { margin-top: 4px; }

/* ---- places where the host page can put its own content ---- */
slot[name="empty"] { display: contents; }
::slotted([slot="sidebar-top"]), ::slotted([slot="sidebar-bottom"]), ::slotted([slot="thread-top"]) { flex: none; }

/* ---- one pane at a time on phones and narrow embeds ---- */
@container (max-width: 700px) {
  .root { border: 0; border-radius: 0; }
  .side { width: 100%; border-inline-end: 0; }
  .main { display: none; }
  .root.open .side { display: none; }
  .root.open .main { display: flex; }
  .backbtn { display: inline-flex; align-items: center; width: auto; min-width: 40px; padding-inline: 6px 2px; border-radius: 20px; }
  .backbtn .badge { margin-inline-start: -2px; }
  .col { max-width: 84%; }
  .msgs { padding-inline: 10px; }
  .acts { display: none; }
  .sheet { inset-inline: 8px; width: auto; grid-template-columns: repeat(4, 1fr); }
  .menu { inset-inline: 8px; }
  .emojis { width: 100%; }
  .fab { display: grid; }
  .newbtn { display: none; } /* the floating button does this job on a phone */
  .cambtn { display: inline-grid; }
  .composer.typing .cambtn { display: none; }
  .list { padding-bottom: 84px; }
  /* room for the notch and the home indicator when the chat fills the screen */
  .side > .bar, .main > .bar { padding-top: calc(8px + env(safe-area-inset-top, 0px)); }
  .bubble { font-size: 16px; }
  .meta { font-size: 11px; }
  .conv { padding: 10px 12px; border-radius: 0; }
  .list { padding-inline: 0; }
  .conv .body { border-bottom: var(--pc-border-width) solid var(--pc-border); padding-bottom: 10px; margin-bottom: -10px; }
  .main > .bar { gap: 0; padding-inline: 4px; }
  .who { padding-inline: 2px; gap: 8px; }
  .composer { padding-inline: 8px; }
  .row .acts { display: none; }
  .chips { padding-inline: 8px; }
  .toast { bottom: 76px; }
  /* 16px inputs stop phones zooming the page when a field is focused */
  textarea, input[type="text"], input[type="search"], input[type="password"], input[type="datetime-local"], select { font-size: 16px; }
  .bar { min-height: 56px; }
  /* small prompts rise from the bottom edge, the way sheets do on a phone */
  dialog { margin: auto 0 0; width: 100%; max-width: 100%; max-height: 92%; border-radius: 20px 20px 0 0; border-width: 1px 0 0; animation: pc-up .22s ease-out; }
  dialog form, dialog .panel { padding-bottom: calc(18px + env(safe-area-inset-bottom, 0px)); }
  dialog:not(.page) .panel::before { content: ""; width: 38px; height: 4px; border-radius: 2px; background: var(--pc-border); align-self: center; margin-bottom: 2px; }
  /* whole screens (settings, info, new chat) take over the display and get a back arrow */
  dialog.page { margin: 0; height: 100%; max-height: 100%; border-radius: 0; border: 0; animation: pc-side .2s ease-out; }
  dialog.page form, dialog.page .panel { min-height: 100%; }
  dialog.page h3 { position: sticky; top: -18px; z-index: 2; background: var(--pc-bg); margin: -18px -18px 0; padding: 10px 8px; min-height: 56px; border-bottom: var(--pc-border-width) solid var(--pc-border); }
  dialog.page .pageback { display: inline-grid; }
  dialog.page .pageclose { display: none; }
  .people { max-height: none; }
}
@keyframes pc-up { from { transform: translateY(40px); opacity: .6; } }
@keyframes pc-side { from { transform: translateX(28px); opacity: .6; } }
@media (prefers-reduced-motion: reduce) { dialog, .row.new .col, .toast { animation: none !important; } }
`;
