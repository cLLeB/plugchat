// The embed page's side of the bridge to native apps and parent pages. The
// wrappers in starters/mobile rely on exactly these names and messages. This
// runs the real client/embed.js against stand-ins for each kind of host; the
// wrappers themselves still have to be run on devices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { signToken } from '../server/index.js';

const SECRET = 'test-secret-test-secret-test-secret-0123456789';

/** Load embed.js as if inside a WebView or iframe. `host` adds whatever that environment puts on `window`. */
async function load(name, { search = '', host = {} } = {}) {
  class FakeChat extends EventTarget {
    attributes = {};
    style = { values: {}, setProperty(k, v) { this.values[k] = v; } };
    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k] ?? null; }
  }
  const el = new FakeChat();
  const listeners = [];
  const win = { addEventListener: (type, fn) => type === 'message' && listeners.push(fn), ...host };
  win.parent ??= win; // a WebView has no parent page
  Object.assign(globalThis, {
    window: win,
    document: { querySelector: () => el },
    location: { search, hash: '', pathname: '/plugchat/embed' },
    history: { replaceState() {} },
  });
  await import(`../client/embed.js?${name}`);
  const receive = (data, origin = 'https://app.example') => listeners.forEach((fn) => fn({ data, origin }));
  return { el, win, receive };
}

const bridges = {
  'React Native (window.ReactNativeWebView)': (sent) => ({ ReactNativeWebView: { postMessage: (text) => sent.push(text) } }),
  'Android and Flutter (window.PlugChatNative)': (sent) => ({ PlugChatNative: { postMessage: (text) => sent.push(text) } }),
  'iOS (webkit.messageHandlers.PlugChatNative)': (sent) => ({ webkit: { messageHandlers: { PlugChatNative: { postMessage: (text) => sent.push(text) } } } }),
};

for (const [name, make] of Object.entries(bridges)) {
  test(`embed page ↔ ${name}: asks for a token, takes it back, reports unread counts and calls`, async () => {
    const sent = [];
    const { el, win } = await load(name, { search: '?calls=native&layout=bubbles&peer=kofi', host: make(sent) });
    assert.equal(el.attributes.layout, 'bubbles');
    assert.equal(el.attributes.peer, 'kofi');
    assert.ok(el.attributes.server, 'the page points the chat at the server it was loaded from');

    // The chat needs a token: the page asks the app, as a JSON string.
    const pending = el.getToken();
    assert.deepEqual(sent.map((t) => JSON.parse(t)), [{ type: 'plugchat:token-request' }]);
    // The app answers by calling the function the wrappers call.
    const token = signToken({ sub: 'ama', name: 'Ama' }, SECRET, 300);
    win.plugchatSetToken(token);
    assert.equal(await pending, token);
    assert.equal(await el.getToken(), token, 'a token that is still valid is reused without asking again');
    assert.equal(sent.length, 1);

    el.dispatchEvent(new CustomEvent('plugchat:unread', { detail: { count: 3 } }));
    assert.deepEqual(JSON.parse(sent.at(-1)), { type: 'plugchat:unread', count: 3 });

    // Only ids leave the page, never message content.
    el.dispatchEvent(new CustomEvent('plugchat:message', { detail: { message: { conversationId: 'c1', senderId: 'kofi', text: 'secret words' } } }));
    assert.deepEqual(JSON.parse(sent.at(-1)), { type: 'plugchat:message', conversationId: 'c1', senderId: 'kofi' });

    // With ?calls=native the app runs the call in its own SDK.
    const join = new CustomEvent('plugchat:call-join', { cancelable: true, detail: { callId: 'call-1', url: 'https://calls.example/r/1', data: { token: 't' } } });
    el.dispatchEvent(join);
    assert.equal(join.defaultPrevented, true);
    assert.deepEqual(JSON.parse(sent.at(-1)), { type: 'plugchat:call-join', callId: 'call-1', url: 'https://calls.example/r/1', data: { token: 't' } });
  });
}

test('embed page ↔ a parent web page (iframe): messages only go to, and are only taken from, the named origin', async () => {
  const posted = [];
  const parent = { postMessage: (message, target) => posted.push({ message, target }) };
  const { el, receive } = await load('iframe', { search: '?origin=https://alumni.example&accent=%230b6b4f', host: { parent } });
  assert.equal(el.style.values['--pc-accent'], '#0b6b4f');

  const pending = el.getToken();
  assert.deepEqual(posted, [{ message: { type: 'plugchat:token-request' }, target: 'https://alumni.example' }]);
  const token = signToken({ sub: 'ama', name: 'Ama' }, SECRET, 300);
  let settled = false;
  pending.then(() => (settled = true));
  receive({ type: 'plugchat:token', token: 'from-another-site' }, 'https://evil.example');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(settled, false, 'a token from any other origin is ignored');
  receive({ type: 'plugchat:token', token }, 'https://alumni.example');
  assert.equal(await pending, token);
});

test('the mobile wrappers use the names the embed page listens for', () => {
  const read = (path) => readFileSync(new URL(`../starters/mobile/${path}`, import.meta.url), 'utf8');
  for (const [file, bridge] of [
    ['react-native/PlugChatScreen.tsx', 'onMessage'],
    ['flutter/plugchat_screen.dart', "'PlugChatNative'"],
    ['android/PlugChatView.kt', '"PlugChatNative"'],
    ['ios/PlugChatView.swift', '"PlugChatNative"'],
  ]) {
    const source = read(file);
    assert.ok(source.includes(bridge), `${file}: bridge name`);
    assert.ok(source.includes('plugchatSetToken'), `${file}: hands the token back`);
    assert.ok(source.includes('plugchat:token-request'), `${file}: answers the token request`);
    assert.ok(source.includes('plugchat:unread'), `${file}: reads the unread count`);
    assert.ok(/["'\/]embed\b/.test(source), `${file}: opens the embed page`);
  }
});
