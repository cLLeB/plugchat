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
| `heading` | Sidebar title |
| `theme` | `light` or `dark`; follows the system by default |
| `e2ee`, `calls`, `stories` | Set to `off` to hide that feature |

Theme it with CSS variables: `--pc-accent`, `--pc-accent-fg`, `--pc-bg`,
`--pc-surface`, `--pc-fg`, `--pc-muted`, `--pc-border`, `--pc-bubble`, `--pc-radius`.

Events on the element: `plugchat:ready`, `plugchat:unread` (`detail.count`),
`plugchat:message` (`detail.message`), `plugchat:call`.

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

### Mobile apps

Serve a page on your site that contains only the `<plug-chat>` tag and open it
in a WebView (`WKWebView`, Android `WebView`, `react-native-webview`,
Flutter `webview_flutter`). The page authenticates the same way your mobile web
session does. For a fully native UI, call the REST and WebSocket API in
[API.md](API.md) directly; note that end-to-end encryption then has to be
implemented natively to the format described in [SECURITY.md](SECURITY.md).

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
