# Integrating PlugChat

Three steps: run it, sign tokens, show the UI.

## 1. Run it

### Inside an existing Node server

```js
import { createServer } from 'node:http';
import { createPlugChat } from 'plugchat';

const chat = createPlugChat({ secret: process.env.PLUGCHAT_SECRET, dataDir: './chat-data' });

const server = createServer(async (req, res) => {
  if (await chat.handle(req, res)) return; // PlugChat took it (everything under /plugchat)
  yourApp(req, res);
});
chat.attach(server); // realtime
server.listen(3000);
```

With Express: `app.use(async (req, res, next) => (await chat.handle(req, res)) || next())`,
then `chat.attach(httpServer)`. Register it before any body-parsing middleware,
because PlugChat reads request bodies itself.

### Beside a backend in any other language

Run it as its own process and proxy `/plugchat` to it from your web server.

```bash
node bin/plugchat.js secret
```

Put the printed value in the `PLUGCHAT_SECRET` environment variable of both
PlugChat and your backend, set `PLUGCHAT_ORIGINS` to your site's origin, then:

```bash
node bin/plugchat.js start
```

Or build the included `Dockerfile`. Nginx needs WebSocket upgrade headers on the proxied path:

```nginx
location /plugchat/ {
  proxy_pass http://127.0.0.1:4400;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

### Settings

| Option (Node) | Environment variable | Default | Meaning |
|---|---|---|---|
| `secret` | `PLUGCHAT_SECRET` | required | Shared signing secret, at least 32 characters |
| `dataDir` | `PLUGCHAT_DATA` | `./plugchat-data` | Database file and uploads |
| `basePath` | `PLUGCHAT_BASE_PATH` | `/plugchat` | URL prefix |
| `origins` | `PLUGCHAT_ORIGINS` | `*` | Comma-separated browser origins allowed to call the API. Set this in production |
| `webhookUrl` | `PLUGCHAT_WEBHOOK_URL` | none | Your endpoint for signed events |
| `directory` | `PLUGCHAT_DIRECTORY=off` | on | Let users browse and search the user list by name |
| `handleVisibility` | `PLUGCHAT_HANDLE_VISIBILITY=all` | `none` | Whether users can see each other's email/phone/etc. |
| `stories` | `PLUGCHAT_STORIES=off` | on | Stories feature |
| `requireEncryption` | `PLUGCHAT_REQUIRE_E2EE=on` | off | Refuse conversations that are not end-to-end encrypted |
| `iceServers` | `PLUGCHAT_ICE_SERVERS` (JSON) | a public STUN server | STUN/TURN servers for calls |
| `maxFileBytes` | `PLUGCHAT_MAX_FILE_MB` | 10 MB | Upload size limit |
| `rateLimit` | — | 5 writes/s, burst 30 | Per-user write limit |
| `maxTokenLifetimeSeconds` | `PLUGCHAT_MAX_TOKEN_SECONDS` | 86400 | Tokens valid for longer than this are refused |
| `previousSecrets` | `PLUGCHAT_PREVIOUS_SECRETS` | none | Outgoing secrets still accepted while you rotate |
| `storage` | — | local disk | Where uploads are kept (see [CONNECTORS.md](CONNECTORS.md)) |
| `hooks`, `hookUrl`, `hookEvents`, `hookFailOpen` | `PLUGCHAT_HOOK_URL`, `PLUGCHAT_HOOK_EVENTS`, `PLUGCHAT_HOOK_FAIL_OPEN=on` | none | Your billing, moderation and call-vendor hooks |

## 2. Sign tokens

Add one authenticated endpoint to your backend. It confirms who is logged in
using your existing session and returns `{"token": "..."}`.

The token is a standard HS256 JWT. Any JWT library works; the claims are:

| Claim | Required | Meaning |
|---|---|---|
| `sub` | yes | Your stable id for the user (any string up to 128 characters) |
| `exp` | yes | Expiry, seconds since epoch. Keep it short, around 10 minutes |
| `name` | recommended | Display name |
| `avatar` | no | `https://` image URL |
| `email`, `phone`, `username` | no | Ways other users can find this person |
| `handles` | no | Custom identifiers, e.g. `{"member_no": "AA-0042"}` |
| `admin` | no | `true` makes a server-to-server token. Never give one to a browser |

Names, avatars and handles are picked up from the token each time, so there is
nothing to sync. To make people findable before they first open chat, register
them with the admin API (`PUT /v1/users/:id`, see [API.md](API.md)).

### Node

```js
import { signToken } from 'plugchat';
const token = signToken({ sub: user.id, name: user.name, email: user.email }, process.env.PLUGCHAT_SECRET, 600);
```

### Python

```python
import base64, hashlib, hmac, json, time

def chat_token(secret, user_id, name, ttl=600, **extra):
    b64u = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
    dump = lambda o: b64u(json.dumps(o, separators=(",", ":")).encode())
    now = int(time.time())
    head = dump({"alg": "HS256", "typ": "JWT"})
    body = dump({"sub": str(user_id), "name": name, "iat": now, "exp": now + ttl, **extra})
    sig = b64u(hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest())
    return f"{head}.{body}.{sig}"
```

### PHP

```php
function chat_token(string $secret, string $userId, string $name, int $ttl = 600, array $extra = []): string {
    $b64u = fn(string $s) => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    $now = time();
    $head = $b64u(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $body = $b64u(json_encode(['sub' => $userId, 'name' => $name, 'iat' => $now, 'exp' => $now + $ttl] + $extra));
    $sig = $b64u(hash_hmac('sha256', "$head.$body", $secret, true));
    return "$head.$body.$sig";
}
```

### Go

```go
func ChatToken(secret, userID, name string, ttl time.Duration) string {
	enc := base64.RawURLEncoding
	now := time.Now().Unix()
	head := enc.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	claims, _ := json.Marshal(map[string]any{"sub": userID, "name": name, "iat": now, "exp": now + int64(ttl.Seconds())})
	body := enc.EncodeToString(claims)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(head + "." + body))
	return head + "." + body + "." + enc.EncodeToString(mac.Sum(nil))
}
```

### Ruby

```ruby
require "base64"; require "json"; require "openssl"

def chat_token(secret, user_id, name, ttl: 600, **extra)
  b64u = ->(s) { Base64.urlsafe_encode64(s, padding: false) }
  now = Time.now.to_i
  head = b64u.(JSON.generate(alg: "HS256", typ: "JWT"))
  body = b64u.(JSON.generate({ sub: user_id.to_s, name: name, iat: now, exp: now + ttl }.merge(extra)))
  "#{head}.#{body}.#{b64u.(OpenSSL::HMAC.digest("SHA256", secret, "#{head}.#{body}"))}"
end
```

### Java

```java
static String chatToken(String secret, String userId, String name, long ttlSeconds) throws Exception {
    Base64.Encoder enc = Base64.getUrlEncoder().withoutPadding();
    long now = System.currentTimeMillis() / 1000;
    String head = enc.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(UTF_8));
    // Build this JSON with your JSON library so names are escaped correctly.
    String claims = new ObjectMapper().writeValueAsString(Map.of("sub", userId, "name", name, "iat", now, "exp", now + ttlSeconds));
    String body = enc.encodeToString(claims.getBytes(UTF_8));
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secret.getBytes(UTF_8), "HmacSHA256"));
    return head + "." + body + "." + enc.encodeToString(mac.doFinal((head + "." + body).getBytes(UTF_8)));
}
```

### C#

```csharp
static string ChatToken(string secret, string userId, string name, int ttlSeconds = 600) {
    static string B64u(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    var head = B64u(Encoding.UTF8.GetBytes("{\"alg\":\"HS256\",\"typ\":\"JWT\"}"));
    var body = B64u(JsonSerializer.SerializeToUtf8Bytes(new { sub = userId, name, iat = now, exp = now + ttlSeconds }));
    using var mac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
    return $"{head}.{body}.{B64u(mac.ComputeHash(Encoding.UTF8.GetBytes($"{head}.{body}")))}";
}
```

## 3. Show the UI

Pick whichever fits the platform. All of them talk to the same server and can be mixed.

| Your platform is… | Use |
|---|---|
| A site or web app where you can add a script tag | `<plug-chat>` on a page |
| A site with no page to spare for chat | `<plug-chat-launcher>`, a floating button |
| A site builder, CMS or anything that only accepts a URL | An `<iframe>` of `/plugchat/embed` |
| A native iOS, Android, Flutter or React Native app | A WebView of `/plugchat/embed`, or the REST API |
| Something with its own design system | The headless client, or the REST and WebSocket API |

### Any web page

```html
<script type="module" src="/plugchat/client/element.js"></script>
<plug-chat server="/plugchat" token-url="/api/chat-token"></plug-chat>
```

`token-url` is fetched with the visitor's cookies, so it works with whatever
session your site already has. Give the element a height with CSS.

| Attribute | Meaning |
|---|---|
| `server` | Where PlugChat is mounted |
| `token-url` | Your endpoint returning `{"token": "..."}` |
| `token` | A token rendered into the page, if you prefer (it cannot refresh itself) |
| `peer` | Open straight into a chat with this user id, e.g. a "Message seller" button |
| `peer-handle` | Same, by email, phone or username |
| `invite` | Join a group by invite code on load, e.g. from your own `/join/CODE` links |
| `heading` | Sidebar title |
| `theme` | `light` or `dark`; follows the system by default |
| `e2ee`, `calls`, `stories` | Set to `off` to hide that feature |

Theme it with CSS variables: `--pc-accent`, `--pc-accent-fg`, `--pc-bg`,
`--pc-surface`, `--pc-fg`, `--pc-muted`, `--pc-border`, `--pc-bubble`, `--pc-radius`.

Events on the element: `plugchat:ready`, `plugchat:unread` (`detail.count`),
`plugchat:message` (`detail.message`), `plugchat:call`, `plugchat:call-join`
(cancelable, see [CONNECTORS.md](CONNECTORS.md)) and `plugchat:invite` (set
`detail.text` to the shareable link your site wants shown for `detail.code`).

Properties: `getToken`, `renderers` and `actions` (see connectors).

### React, Vue, Angular, Svelte

Custom elements work as ordinary tags. Load the script once, then:

```jsx
// React
function Chat() {
  const ref = useRef(null);
  useEffect(() => { ref.current.getToken = () => fetch('/api/chat-token').then((r) => r.json()).then((j) => j.token); }, []);
  return <plug-chat ref={ref} server="/plugchat" style={{ height: 600 }} />;
}
```

In Vue, mark it as a custom element (`compilerOptions.isCustomElement`); in
Angular, add `CUSTOM_ELEMENTS_SCHEMA`.

### Floating button

```html
<script type="module" src="/plugchat/client/launcher.js"></script>
<plug-chat-launcher server="/plugchat" token-url="/api/chat-token"></plug-chat-launcher>
```

A button in the corner with an unread badge; pressing it opens the chat in a
panel (full screen on phones). It takes the same attributes, properties and
events as `<plug-chat>`, plus `position="left"` and `label`. Colour it with
`plug-chat-launcher { --pc-accent: #0b6b4f; }`.

### Iframe

For platforms where you can paste an iframe but not run a module script:

```html
<iframe id="chat" src="https://chat.your-site.example/plugchat/embed?origin=https://your-site.example"
        allow="camera; microphone; display-capture" style="width:100%;height:600px;border:0"></iframe>
<script>
  const frame = document.getElementById('chat');
  addEventListener('message', async (e) => {
    if (e.source !== frame.contentWindow) return;
    if (e.data?.type === 'plugchat:token-request') {
      const { token } = await (await fetch('/api/chat-token')).json();
      frame.contentWindow.postMessage({ type: 'plugchat:token', token }, 'https://chat.your-site.example');
    }
    if (e.data?.type === 'plugchat:unread') showBadge(e.data.count);
  });
</script>
```

The frame asks for a token whenever it needs one, so your token endpoint never
has to accept cross-origin requests. Options go in the query string: `peer`,
`peer-handle`, `invite`, `heading`, `theme`, `accent` (a hex colour), and
`calls`, `stories`, `e2ee` (`off`). Pass `origin` so the frame only exchanges
messages with your page. When `origins` is configured on the server, only those
sites are allowed to frame the chat at all.

### Mobile apps

Open `https://chat.your-site.example/plugchat/embed` in a WebView and hand it
tokens from native code. The page calls out when it needs one and accepts it back:

| Platform | Page → app | App → page |
|---|---|---|
| React Native (`react-native-webview`) | `onMessage` receives `{"type":"plugchat:token-request"}` | `webview.injectJavaScript("plugchatSetToken('…')")` |
| Android `WebView` | `addJavascriptInterface(obj, "PlugChatNative")`, method `postMessage(String)` | `webView.evaluateJavascript("plugchatSetToken('…')", null)` |
| iOS `WKWebView` | script message handler named `PlugChatNative` | `webView.evaluateJavaScript("plugchatSetToken('…')")` |
| Flutter `webview_flutter` | `JavaScriptChannel` named `PlugChatNative` | `controller.runJavaScript("plugchatSetToken('…')")` |

The same channel delivers `plugchat:unread` (for the app icon badge) and
`plugchat:message` (ids only, never content). Add `?calls=native` and the page
hands `plugchat:call-join` to your app instead of opening calls itself, so you
can run them in your call vendor's native SDK. Grant the WebView camera and
microphone permission if you use built-in calls or voice notes.

The native bridges follow each platform's documented WebView API but have only
been exercised here through the browser `postMessage` path.

For a fully native UI, call the REST and WebSocket API in [API.md](API.md)
directly; note that end-to-end encryption then has to be implemented natively
to the format described in [SECURITY.md](SECURITY.md).

### Your own UI

```js
import { PlugChat } from '/plugchat/client/plugchat.js';

const chat = new PlugChat({ url: '/plugchat', getToken: () => fetch('/api/chat-token').then((r) => r.json()).then((j) => j.token) });
await chat.connect();
chat.on('message', (m) => console.log(m.senderId, m.text));

const dm = await chat.openDmByHandle('ama@example.com');
await chat.send(dm.id, { text: 'Hello' });
```

## Push notifications and email

Set `webhookUrl`. PlugChat POSTs each new message to it with everything needed
to decide whom to notify: who is offline, who muted the chat, who was mentioned.
Verify the `x-plugchat-signature` header before trusting the body:

```js
import { signWebhook } from 'plugchat';
const ok = req.headers['x-plugchat-signature'] === signWebhook(rawBody, process.env.PLUGCHAT_SECRET);
```

In other languages: `"sha256=" + hex(HMAC_SHA256(secret, rawBody))`, compared in constant time.

For encrypted conversations the webhook carries ciphertext, so your
notification can only say "New message from Ama".
