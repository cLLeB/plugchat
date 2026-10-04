// Runs inside /plugchat/embed: the whole chat as a page, for places that can
// only show a URL — an <iframe> on a site builder, or a WebView in a native
// iOS, Android, Flutter or React Native app.
//
// The embedding app supplies tokens, in whichever way suits it:
//   - parent page:   postMessage({ type: 'plugchat:token', token }) in reply to 'plugchat:token-request'
//   - native app:    window.plugchatSetToken(token) via its WebView's JS injection
//   - one-off:       #token=... in the URL fragment (never sent to the server)

const el = document.querySelector('plug-chat');
const query = new URLSearchParams(location.search);
const hostOrigin = query.get('origin'); // the embedding page, when it wants messages pinned to it

for (const name of ['peer', 'peer-handle', 'invite', 'lang', 'theme', 'heading', 'calls', 'stories', 'e2ee']) {
  if (query.has(name)) el.setAttribute(name, query.get(name));
}
if (/^#[0-9a-f]{3,8}$/i.test(query.get('accent') ?? '')) el.style.setProperty('--pc-accent', query.get('accent'));

const expiry = (token) => {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000;
  } catch {
    return 0;
  }
};

let token = new URLSearchParams(location.hash.slice(1)).get('token');
if (token) history.replaceState(null, '', location.pathname + location.search); // keep it out of history
let waiting = [];

function setToken(value) {
  if (typeof value !== 'string' || !value) return;
  token = value;
  for (const resolve of waiting.splice(0)) resolve(value);
}
window.plugchatSetToken = setToken;

function tell(message) {
  if (window.parent !== window) window.parent.postMessage(message, hostOrigin ?? '*');
  const text = JSON.stringify(message);
  window.ReactNativeWebView?.postMessage(text); // react-native-webview
  window.PlugChatNative?.postMessage(text); // Android addJavascriptInterface / Flutter JavaScriptChannel
  window.webkit?.messageHandlers?.PlugChatNative?.postMessage(text); // iOS WKWebView
}

window.addEventListener('message', (e) => {
  if (hostOrigin && e.origin !== hostOrigin) return;
  let data = e.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return;
    }
  }
  if (data?.type === 'plugchat:token') setToken(data.token);
});

el.getToken = () => {
  if (token && expiry(token) > Date.now() + 5000) return Promise.resolve(token);
  return new Promise((resolve, reject) => {
    waiting.push(resolve);
    tell({ type: 'plugchat:token-request' });
    setTimeout(() => reject(new Error('the app did not provide a sign-in token')), 15_000);
  });
};

// Only counts and ids leave the frame, never message content.
el.addEventListener('plugchat:ready', (e) => tell({ type: 'plugchat:ready', userId: e.detail.user.id }));
el.addEventListener('plugchat:unread', (e) => tell({ type: 'plugchat:unread', count: e.detail.count }));
el.addEventListener('plugchat:message', (e) => tell({ type: 'plugchat:message', conversationId: e.detail.message.conversationId, senderId: e.detail.message.senderId }));
el.addEventListener('plugchat:call-join', (e) => {
  // A native app usually wants to run the call in its own vendor SDK.
  if (query.get('calls') === 'native') {
    e.preventDefault();
    tell({ type: 'plugchat:call-join', callId: e.detail.callId, url: e.detail.url, data: e.detail.data });
  }
});

el.setAttribute('server', new URL('..', import.meta.url).pathname.replace(/\/$/, ''));

// Loaded last, so the element starts with its language and options already in place.
await import('./element.js');
