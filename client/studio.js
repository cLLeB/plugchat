// The setup studio at /plugchat/studio: where a platform's developer shapes
// the chat to fit their product and collects the code to integrate it.
// Left: the controls. Middle: the real chat, signed in as a test member,
// changing as the controls move. Right: the settings and code that produce it.
//
// It is a development tool. The server only serves it when `studio` is on.
import './element.js';

const base = new URL('.', location.href).pathname.replace(/\/$/, '');
const info = await fetch(`${base}/studio/state`).then((r) => r.json());

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

const SYSTEM_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
// [token, label, kind, default, extra]
const TOKENS = [
  ['accent', 'Brand colour', 'color', '#e8452c'],
  ['accentFg', 'Text on the brand colour', 'color', '#ffffff'],
  ['bg', 'Panels', 'color', '#ffffff'],
  ['surface', 'Fields and hover', 'color', '#f2f3f7'],
  ['chat', 'Behind the messages', 'color', '#ffffff'],
  ['fg', 'Text', 'color', '#111418'],
  ['muted', 'Secondary text', 'color', '#667085'],
  ['border', 'Lines', 'color', '#e6e8ee'],
  ['bubble', 'Incoming message', 'color', '#eef0f5'],
  ['bubbleOut', 'Outgoing message', 'text', '', 'a colour or a CSS gradient'],
  ['radius', 'Frame corners', 'range', 16, [0, 28, 'px']],
  ['bubbleRadius', 'Message corners', 'range', 20, [0, 24, 'px']],
  ['controlRadius', 'Buttons and fields', 'range', 12, [0, 24, 'px']],
  ['borderWidth', 'Line thickness', 'range', 1, [0, 3, 'px']],
  ['fontSize', 'Text size', 'range', 15, [12, 20, 'px']],
  ['sidebarWidth', 'Chat list width', 'range', 340, [240, 440, 'px']],
  ['avatarRadius', 'Picture shape', 'select', '50%', [['50%', 'Circle'], ['30%', 'Rounded'], ['6px', 'Square']]],
  ['font', 'Typeface', 'select', SYSTEM_FONT, [[SYSTEM_FONT, 'System'], ['Georgia, "Times New Roman", serif', 'Serif'], ['"Trebuchet MS", "Segoe UI", sans-serif', 'Humanist'], ['ui-monospace, Consolas, monospace', 'Monospace']]],
  ['pattern', 'Backdrop pattern', 'select', 'none', [['none', 'None'], ['radial-gradient(color-mix(in srgb, currentColor 7%, transparent) 1px, transparent 1.4px)', 'Dots']]],
];
const DARK_TOKENS = [
  ['bg', 'Panels', '#14161c'], ['surface', 'Fields and hover', '#20232c'], ['chat', 'Behind the messages', '#14161c'],
  ['fg', 'Text', '#e9ecf1'], ['border', 'Lines', '#2a2f38'], ['bubble', 'Incoming message', '#262a35'],
];
const PRESETS = {
  'Default': {},
  'Workspace': { layout: 'flat', density: 'compact', theme: { accent: '#0e7c86', bubbleOut: '#0e7c86', radius: '8px', controlRadius: '6px', avatarRadius: '6px' } },
  'Soft': { theme: { accent: '#d6336c', bubbleOut: 'linear-gradient(to bottom, #ff8a5c, #d6336c)', radius: '24px', bubbleRadius: '24px', controlRadius: '20px', chat: '#fff7f6', bubble: '#ffffff' } },
  'Minimal': { theme: { accent: '#111418', bubbleOut: '#111418', radius: '0px', bubbleRadius: '6px', controlRadius: '4px', chat: '#ffffff', pattern: 'none' }, dark: { accent: '#e9ecf1', accentFg: '#111418', bubbleOut: '#e9ecf1', bubbleOutFg: '#111418' } },
  'Forest': { theme: { accent: '#0b6b4f', bubbleOut: '#0b6b4f', chat: '#eef5f1', bubble: '#ffffff', surface: '#e9f0ec' } },
};
const FEATURE_LABELS = {
  groups: 'Group chats', directory: 'Browse people', files: 'Photos and files', voiceNotes: 'Voice notes', reactions: 'Reactions', replies: 'Replies',
  editing: 'Edit messages', deleting: 'Delete own messages', forwarding: 'Forward', mentions: '@mentions', pins: 'Pin messages', stars: 'Starred messages',
  search: 'Message search', polls: 'Polls', location: 'Share location', viewOnce: 'View once', disappearing: 'Disappearing messages', scheduled: 'Send later',
  stories: 'Stories', calls: 'Voice and video calls', encryption: 'End-to-end encryption', invites: 'Invite codes', reports: 'Report a message',
  profiles: 'Change own picture and about', typing: 'Typing indicator', presence: 'Online status', readReceipts: 'Read receipts', blocking: 'Block people', export: 'Export data', personalization: 'Personal colours and style',
};
const WORDING = ['Chats', 'Message', 'New chat', 'Search chats and messages', 'Select a conversation to start chatting.', 'No conversations yet. Press + to start one.'];

// What the developer has chosen so far. Starts from what the server is already configured with.
const state = {
  theme: { ...info.ui.theme }, dark: { ...info.ui.dark },
  layout: info.ui.layout ?? 'bubbles', density: info.ui.density ?? 'comfortable',
  heading: info.ui.heading ?? '', strings: { ...info.ui.strings }, css: info.ui.css ?? '',
  features: Object.fromEntries(info.featureNames.map((name) => [name, info.features[name] !== false])),
  viewer: info.users[0].id, device: 'desktop', mode: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', embed: 'html', backend: info.starters[0]?.id, tab: 'embed',
};

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));
function uiNow() {
  const ui = {};
  if (Object.keys(clean(state.theme)).length) ui.theme = clean(state.theme);
  if (Object.keys(clean(state.dark)).length) ui.dark = clean(state.dark);
  if (state.layout !== 'bubbles') ui.layout = state.layout;
  if (state.density !== 'comfortable') ui.density = state.density;
  if (state.heading) ui.heading = state.heading;
  if (Object.keys(clean(state.strings)).length) ui.strings = clean(state.strings);
  if (state.css.trim()) ui.css = state.css;
  return ui;
}
const featuresOff = () => Object.fromEntries(Object.entries(state.features).filter(([, on]) => !on).map(([name]) => [name, false]));

// ---- the live preview ----

const $stage = h('div', { class: 'stage' });
let chatEl;
function mount() {
  chatEl = h('plug-chat', { server: base, theme: state.mode });
  chatEl.getToken = () => fetch(`${base}/studio/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: state.viewer }) }).then((r) => r.json()).then((j) => j.token);
  chatEl.ui = { ...uiNow(), layout: state.layout, density: state.density };
  chatEl.features = featuresOff();
  $stage.replaceChildren(chatEl);
  $stage.dataset.device = state.device;
}
function refresh({ remount = false } = {}) {
  if (remount) mount();
  else {
    chatEl.setAttribute('theme', state.mode);
    chatEl.ui = { ...uiNow(), layout: state.layout, density: state.density };
    chatEl.features = featuresOff();
    $stage.dataset.device = state.device;
  }
  renderOutput();
}

// ---- controls ----

const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const field = (label, control, extra) => h('label', { class: 'field' }, h('span', {}, label), control, extra);

function tokenControl([key, label, kind, fallback, extra], bag = state.theme) {
  const set = (value) => {
    bag[key] = value;
    refresh();
  };
  if (kind === 'color') {
    const used = h('button', { class: 'reset', type: 'button', title: 'Back to the default', hidden: !bag[key], onclick: () => (set(''), (input.value = fallback), (used.hidden = true)) }, 'reset');
    const input = h('input', { type: 'color', value: bag[key] || fallback, oninput: () => (set(input.value), (used.hidden = false)) });
    return field(label, input, used);
  }
  if (kind === 'range') {
    const [min, max, unit] = extra;
    const out = h('output', {}, `${parseFloat(bag[key]) || fallback}${unit}`);
    const input = h('input', { type: 'range', min, max, value: parseFloat(bag[key]) || fallback, oninput: () => {
      out.textContent = `${input.value}${unit}`;
      set(Number(input.value) === fallback ? '' : `${input.value}${unit}`);
    } });
    return field(label, input, out);
  }
  if (kind === 'select') {
    const input = h('select', { onchange: () => set(input.value === fallback ? '' : input.value) }, extra.map(([value, text]) => h('option', { value, selected: (bag[key] ?? fallback) === value }, text)));
    return field(label, input);
  }
  const input = h('input', { type: 'text', value: bag[key] ?? '', placeholder: extra, oninput: () => set(input.value.trim()) });
  return field(label, input);
}

const section = (title, open, ...kids) => h('details', { open }, h('summary', {}, title), h('div', { class: 'body' }, kids));
const choice = (label, key, options, remount = false) => {
  const input = h('select', { onchange: () => ((state[key] = input.value), refresh({ remount })) }, options.map(([value, text]) => h('option', { value, selected: state[key] === value }, text)));
  return field(label, input);
};

function renderControls() {
  const $controls = document.getElementById('controls');
  $controls.replaceChildren(
    h('h2', {}, 'Shape it'),
    h('p', { class: 'lead' }, 'Everything here changes the real chat in the middle. Nothing is saved to the server: copy the result from the right-hand side into your own project.'),
    h('div', { class: 'presets' }, Object.entries(PRESETS).map(([name, preset]) => h('button', { type: 'button', onclick: () => {
      Object.assign(state, { theme: { ...preset.theme }, dark: { ...preset.dark }, layout: preset.layout ?? 'bubbles', density: preset.density ?? 'comfortable' });
      renderControls();
      refresh();
    } }, name))),
    section('Layout', true,
      choice('Messages', 'layout', [['bubbles', 'Bubbles, mine on one side'], ['flat', 'Flat, everyone on one side']]),
      choice('Spacing', 'density', [['comfortable', 'Comfortable'], ['compact', 'Compact']])),
    section('Colours', true, TOKENS.filter((t) => t[2] === 'color' || t[0] === 'bubbleOut').map((t) => tokenControl(t))),
    section('Shape, size and type', false, TOKENS.filter((t) => t[2] !== 'color' && t[0] !== 'bubbleOut').map((t) => tokenControl(t))),
    section('Dark look', false,
      h('p', { class: 'note' }, 'The brand colour, shapes and type carry over. These are the colours that differ in the dark.'),
      DARK_TOKENS.map(([key, label, fallback]) => tokenControl([key, label, 'color', fallback], state.dark))),
    section('What people can do', false,
      h('p', { class: 'note' }, 'Unticked features disappear from the interface and are refused by the server.'),
      h('div', { class: 'checks' }, info.featureNames.map((name) => {
        const locked = info.features[name] === false;
        const box = h('input', { type: 'checkbox', checked: state.features[name], disabled: locked, onchange: () => ((state.features[name] = box.checked), refresh()) });
        return h('label', { title: locked ? 'Switched off in this server\'s settings' : name }, box, FEATURE_LABELS[name] ?? name);
      }))),
    section('Wording', false,
      h('p', { class: 'note' }, 'Any text in the interface can be replaced. A few common ones:'),
      (() => {
        const input = h('input', { type: 'text', value: state.heading, placeholder: 'Chats', oninput: () => ((state.heading = input.value), refresh({ remount: true })) });
        return field('Title above the chat list', input);
      })(),
      WORDING.slice(1).map((text) => {
        const input = h('input', { type: 'text', value: state.strings[text] ?? '', placeholder: text, onchange: () => ((state.strings[text] = input.value), refresh({ remount: true })) });
        return field(`“${text}”`, input);
      })),
    section('Your own CSS', false,
      h('p', { class: 'note' }, 'For anything the controls do not cover. Class names are in client/styles.js; from your own page you can also use plug-chat::part(bubble) and the other part names.'),
      (() => {
        const input = h('textarea', { rows: '6', spellcheck: 'false', placeholder: '.bubble { box-shadow: none; }', oninput: () => ((state.css = input.value), refresh()) }, state.css);
        input.value = state.css;
        return input;
      })()),
  );
}

// ---- what to copy ----

const origin = location.origin;
const json = (value) => JSON.stringify(value, null, 2);
const indent = (text, by) => text.split('\n').map((line, i) => (i ? by + line : line)).join('\n');

function cssVariables() {
  const lines = (tokens) => Object.entries(clean(tokens)).map(([k, v]) => `  --pc-${kebab(k)}: ${v};`).join('\n');
  let out = `plug-chat {\n  height: 640px;\n${lines(state.theme)}\n}`.replace('\n\n', '\n');
  if (Object.keys(clean(state.dark)).length) out += `\nplug-chat[theme="dark"] {\n${lines(state.dark)}\n}`;
  return out;
}
function pageScript(target) {
  const lines = [];
  const off = featuresOff();
  if (Object.keys(off).length) lines.push(`${target}.features = ${json(off)};`);
  const strings = clean({ ...state.strings });
  if (Object.keys(strings).length) lines.push(`${target}.strings = ${json(strings)};`);
  if (state.css.trim()) lines.push(`${target}.css = ${JSON.stringify(state.css)};`);
  return lines.join('\n');
}
const attrs = () => [state.layout !== 'bubbles' && `layout="${state.layout}"`, state.density !== 'comfortable' && `density="${state.density}"`, state.heading && `heading="${state.heading.replace(/"/g, '&quot;')}"`].filter(Boolean).join(' ');

const EMBEDS = {
  html: ['Any web page', () => {
    const script = pageScript("document.querySelector('plug-chat')");
    return `<script type="module" src="${origin}${base}/client/element.js"></script>\n\n<plug-chat server="${origin}${base}" token-url="/api/chat-token"${attrs() ? ' ' + attrs() : ''}></plug-chat>\n\n<style>\n${cssVariables()}\n</style>${script ? `\n\n<script type="module">\n${script}\n</script>` : ''}`;
  }],
  react: ['React', () => {
    const script = pageScript('ref.current');
    return `// index.html: <script type="module" src="${origin}${base}/client/element.js"></script>\nimport { useEffect, useRef } from 'react';\nimport './chat.css'; // the CSS variables shown under "Any web page"\n\nexport function Chat() {\n  const ref = useRef(null);\n  useEffect(() => {\n    ref.current.getToken = () => fetch('/api/chat-token').then((r) => r.json()).then((j) => j.token);${script ? '\n    ' + indent(script, '    ') : ''}\n  }, []);\n  return <plug-chat ref={ref} server="${origin}${base}"${attrs() ? ' ' + attrs() : ''} />;\n}`;
  }],
  vue: ['Vue', () => `<!-- vite.config: vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('plug-chat') } } }) -->\n<template>\n  <plug-chat ref="chat" server="${origin}${base}" token-url="/api/chat-token"${attrs() ? ' ' + attrs() : ''} />\n</template>\n\n<script setup>\nimport { onMounted, ref } from 'vue';\nconst chat = ref(null);\nonMounted(() => {\n  ${indent(pageScript('chat.value') || '// chat.value.features, .strings, .ui ... can be set here', '  ')}\n});\n</script>\n\n<style>\n${cssVariables()}\n</style>`],
  launcher: ['Floating button', () => `<script type="module" src="${origin}${base}/client/launcher.js"></script>\n\n<plug-chat-launcher server="${origin}${base}" token-url="/api/chat-token"${attrs() ? ' ' + attrs() : ''}></plug-chat-launcher>\n\n<style>\n${cssVariables().replaceAll('plug-chat', 'plug-chat-launcher').replace('  height: 640px;\n', '')}\n</style>`],
  iframe: ['Iframe (site builders, CMS)', () => `<!-- The look comes from the server settings ("Server" tab): an iframe cannot be styled from outside. -->\n<iframe id="chat" src="${origin}${base}/embed?origin=https://YOUR-SITE${state.layout !== 'bubbles' ? `&layout=${state.layout}` : ''}"\n        allow="camera; microphone; display-capture" style="width:100%;height:640px;border:0"></iframe>\n<script>\n  const frame = document.getElementById('chat');\n  addEventListener('message', async (e) => {\n    if (e.source !== frame.contentWindow || e.data?.type !== 'plugchat:token-request') return;\n    const { token } = await (await fetch('/api/chat-token')).json();\n    frame.contentWindow.postMessage({ type: 'plugchat:token', token }, '${origin}');\n  });\n</script>`],
  mobile: ['Mobile app (WebView)', () => `// Open this URL in a WebView. The look comes from the server settings ("Server" tab).\n${origin}${base}/embed${state.layout !== 'bubbles' ? `?layout=${state.layout}` : ''}\n\n// The page asks your app for a token and accepts it back:\n//   React Native   onMessage gets {"type":"plugchat:token-request"}  →  webview.injectJavaScript("plugchatSetToken('…')")\n//   Android        addJavascriptInterface(obj, "PlugChatNative")      →  webView.evaluateJavascript("plugchatSetToken('…')", null)\n//   iOS            message handler named "PlugChatNative"             →  webView.evaluateJavaScript("plugchatSetToken('…')")\n//   Flutter        JavaScriptChannel named "PlugChatNative"           →  controller.runJavaScript("plugchatSetToken('…')")`],
};

function serverSettings() {
  const settings = {};
  if (Object.keys(featuresOff()).length) settings.features = featuresOff();
  if (Object.keys(uiNow()).length) settings.ui = uiNow();
  const file = { origins: ['https://YOUR-SITE'], webhookUrl: 'https://YOUR-SITE/webhooks/plugchat', ...settings };
  const node = `import { createPlugChat } from 'plugchat';\n\nconst chat = createPlugChat({\n  secret: process.env.PLUGCHAT_SECRET,\n  origins: ['https://YOUR-SITE'],${Object.keys(settings).length ? '\n  ' + indent(json(settings).slice(2, -2), '') + ',' : ''}\n});`;
  return [
    ['plugchat.config.json — when PlugChat runs as its own process, beside a backend in any language', json(file)],
    ['Node — when PlugChat runs inside your own Node server', node],
  ];
}

const copyButton = (text) => h('button', { class: 'copy', type: 'button', onclick: (e) => navigator.clipboard.writeText(text).then(() => {
  e.target.textContent = 'Copied';
  setTimeout(() => (e.target.textContent = 'Copy'), 1500);
}) }, 'Copy');
const block = (title, code) => h('div', { class: 'code' }, h('div', { class: 'codehead' }, h('span', {}, title), copyButton(code)), h('pre', {}, code));

function renderOutput() {
  const $out = document.getElementById('output');
  const tab = (key, label) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(state.tab === key), onclick: () => ((state.tab = key), renderOutput()) }, label);
  const pick = (key, options) => {
    const input = h('select', { onchange: () => ((state[key] = input.value), renderOutput()) }, options.map(([value, text]) => h('option', { value, selected: state[key] === value }, text)));
    return input;
  };
  let body;
  if (state.tab === 'embed') {
    body = [
      h('p', { class: 'lead' }, 'Step 3 of 3. Paste this where the chat should appear. It carries the look you chose as CSS variables, so it applies to this page only; to apply it everywhere at once, use the Server tab instead.'),
      pick('embed', Object.entries(EMBEDS).map(([key, [label]]) => [key, label])),
      block(EMBEDS[state.embed][0], EMBEDS[state.embed][1]()),
    ];
  } else if (state.tab === 'server') {
    body = [
      h('p', { class: 'lead' }, 'Step 1 of 3. PlugChat runs on your own server. These settings carry the features and look you chose to every page and app that shows the chat.'),
      serverSettings().map(([title, code]) => block(title, code)),
      block('Start it', 'npx plugchat init      # writes plugchat.config.json and a secret\nnpx plugchat doctor    # checks the settings\nnpx plugchat start'),
    ];
  } else if (state.tab === 'backend') {
    const starter = info.starters.find((s) => s.id === state.backend);
    body = [
      h('p', { class: 'lead' }, 'Step 2 of 3. Your backend adds two small things: an endpoint that says who is signed in, and (optionally) a receiver for events such as "new message", so you can send your own push notifications or emails.'),
      starter ? [
        pick('backend', info.starters.map((s) => [s.id, `${s.name} (${s.frameworks})`])),
        block(`starters/${starter.file}  ·  run: ${starter.run}`, starter.code),
      ] : h('p', { class: 'note' }, 'The starters folder is not installed with this copy. See docs/INTEGRATION.md for the token format.'),
    ];
  } else {
    body = [
      h('p', { class: 'lead' }, 'What this server is running with right now.'),
      h('ul', { class: 'checklist' }, info.checks.map(([level, text]) => h('li', { class: level.toLowerCase() }, h('b', {}, level), text))),
      h('p', { class: 'note' }, `Events you can receive: ${info.events.join(', ')}. Sent to your webhook now: ${info.webhookEvents.join(', ')}.`),
    ];
  }
  $out.replaceChildren(
    h('h2', {}, 'Take it with you'),
    h('div', { class: 'tabs', role: 'tablist' }, tab('server', '1 · Server'), tab('backend', '2 · Backend'), tab('embed', '3 · Embed'), tab('checks', 'Checks')),
    h('div', { class: 'tabbody' }, body),
  );
}

// ---- preview toolbar ----

const toolbarChoice = (key, options, remount) => h('div', { class: 'seg', role: 'radiogroup' }, options.map(([value, text]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(state[key] === value), onclick: (e) => {
  state[key] = value;
  for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-checked', String(b === e.currentTarget));
  refresh({ remount });
} }, text)));

document.getElementById('preview').replaceChildren(
  h('div', { class: 'toolbar' },
    h('span', { class: 'label' }, 'Signed in as'),
    toolbarChoice('viewer', info.users.map((u) => [u.id, u.name.split(' ')[0]]), true),
    h('span', { class: 'gap' }),
    toolbarChoice('device', [['desktop', 'Wide'], ['phone', 'Phone']], false),
    toolbarChoice('mode', [['light', 'Light'], ['dark', 'Dark']], false)),
  $stage,
);

state.tab = 'server';
renderControls();
mount();
renderOutput();
