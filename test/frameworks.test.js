// The promises made to front-end frameworks: importing anything on a server is
// safe, and the React and Vue components render there without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the element, launcher and headless client can be imported where there is no browser', async () => {
  assert.equal(typeof globalThis.HTMLElement, 'undefined', 'this test must run without a DOM');
  const element = await import('../client/element.js');
  const launcher = await import('../client/launcher.js');
  const client = await import('../client/plugchat.js');
  assert.equal(typeof element.PlugChatElement, 'function');
  assert.equal(typeof launcher.PlugChatLauncher, 'function');
  assert.equal(typeof client.PlugChat, 'function');
});

test('the React component renders on the server as the plain tag (Next.js, Remix)', async () => {
  const { createElement } = await import('react');
  const { renderToString } = await import('react-dom/server');
  const { PlugChat, PlugChatLauncher } = await import('../client/react.js');
  const html = renderToString(createElement(PlugChat, {
    server: '/plugchat', tokenUrl: '/api/chat-token', layout: 'bubbles', heading: 'Messages', className: 'chat',
    ui: { theme: { accent: '#0b6b4f' } }, features: { polls: false }, getToken: async () => 'never called on the server', onUnread() {},
  }, createElement('div', { slot: 'sidebar-top' }, 'Welcome')));
  assert.match(html, /^<plug-chat /);
  assert.match(html, /server="\/plugchat"/);
  assert.match(html, /token-url="\/api\/chat-token"/);
  assert.match(html, /layout="bubbles"/);
  assert.match(html, /class="chat"/);
  assert.match(html, /<div slot="sidebar-top">Welcome<\/div>/);
  assert.doesNotMatch(html, /accent|polls|getToken|onUnread/i, 'objects and functions are properties, never attributes');
  assert.match(renderToString(createElement(PlugChatLauncher, { server: '/plugchat', tokenUrl: '/t', position: 'left' })), /^<plug-chat-launcher .*position="left"/);
});

test('the Vue component renders on the server as the plain tag (Nuxt)', async () => {
  const { createSSRApp, h } = await import('vue');
  const { renderToString } = await import('vue/server-renderer');
  const { PlugChat } = await import('../client/vue.js');
  const app = createSSRApp({ render: () => h(PlugChat, { server: '/plugchat', 'token-url': '/api/chat-token', layout: 'bubbles', ui: { theme: { accent: '#0b6b4f' } }, onUnread() {} }, () => h('div', { slot: 'empty' }, 'Pick someone')) });
  const html = await renderToString(app);
  assert.match(html, /^<plug-chat /);
  assert.match(html, /server="\/plugchat"/);
  assert.match(html, /token-url="\/api\/chat-token"/);
  assert.match(html, /<div slot="empty">Pick someone<\/div>/);
  assert.doesNotMatch(html, /accent/);
});
