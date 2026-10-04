# Getting started: adding chat to your platform

This is the path a developer takes from "our platform has no messaging" to
"members are chatting", using the Alumni Association site from the demo as the
example. Plan on an afternoon. Nothing here is hosted by anyone else: PlugChat
is a program you run on your own server, next to the platform you already have.

What you end up with:

```
 your users' browsers and apps
        │  (1) "who am I?"            (3) chat traffic
        ▼                                   ▼
 your backend ── signs a token ──►   PlugChat (a process on your server)
        ▲                                   │
        └──── (4) events: "new message", ───┘   data: one folder on your disk
              "member added", ...               (or your own bucket for uploads)
```

Your platform keeps its users, its login and its database. PlugChat never sees
a password and has no user table to sync.

## Step 0. Try it before you touch your code

```bash
npm install
```

```bash
npm run demo
```

Open http://localhost:3000 to see a pretend platform with chat in it, and
http://localhost:3000/plugchat/studio for the **setup studio**: the real chat in
the middle, controls for its look and features on the left, and the code that
produces what you see on the right. The rest of this page is what the studio's
three tabs (Server, Backend, Embed) give you.

## Step 1. Run PlugChat on your server

Pick the line that matches your backend.

**Your backend is Node** — mount it inside your existing server:

```js
import { createPlugChat } from 'plugchat';

const chat = createPlugChat({ secret: process.env.PLUGCHAT_SECRET, origins: ['https://alumni.example'] });

const server = createServer(async (req, res) => {
  if (await chat.handle(req, res)) return; // everything under /plugchat
  yourApp(req, res);
});
chat.attach(server); // realtime
```

**Your backend is anything else** (PHP, Python, Java, .NET, Go, Ruby...) — run it
as its own process and send `/plugchat` to it from your web server:

```bash
npx plugchat init
```

writes `plugchat.config.json` (every setting, as plain JSON) and a `.env` with
a fresh secret. Then:

```bash
npx plugchat start
```

and in nginx (Apache and Caddy have the same two ideas: proxy the path, allow
WebSocket upgrades):

```nginx
location /plugchat/ {
  proxy_pass http://127.0.0.1:4400;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

Both ways give the same features. The Node form additionally accepts functions
(hooks, plugins, your own storage adapter); the side service gets the same
results over HTTP hooks and plain settings. [INTEGRATION.md](INTEGRATION.md)
lists every setting.

## Step 2. Tell PlugChat who is signed in

Add one endpoint to your backend. It looks at your own session, and answers
with a short-lived token naming that person:

```
GET /api/chat-token   →   {"token": "<signed token>"}
```

Ready-to-run versions are in [`starters/`](../starters): Node, Python, PHP, Go,
Ruby, Java and C#, each a single file with no packages to install. Copy the two
functions (`chat_token` and `signed_by_plugchat`) into your framework's
controller and replace `current_user` with your real signed-in user.

That is the whole identity integration. People are known to PlugChat by the id
you put in the token; add `email`, `phone` or `username` to the token and they
can be found by those too.

To check a starter (or your own endpoint) against a real PlugChat:

```bash
node starters/verify.mjs
```

It starts each starter whose language is installed, confirms PlugChat accepts
the token as the right person, and confirms the webhook receiver accepts a
genuine event and refuses a forged one.

## Step 3. Put the chat on a page

```html
<script type="module" src="/plugchat/client/element.js"></script>
<plug-chat server="/plugchat" token-url="/api/chat-token"></plug-chat>
```

Or a floating button, an iframe, a mobile WebView, or your own interface on the
headless client: the studio's Embed tab generates each one, and
[INTEGRATION.md](INTEGRATION.md) explains them.

## Step 4. Make it yours

Everything visible can be changed, and anything can be switched off. In order
of effort:

| You want to… | Do this |
|---|---|
| Match your brand colours, fonts, corner radii, sizes | CSS variables, or `ui.theme` in the server settings |
| Remove features you do not want (stories, polls, calls, ...) | `features: { stories: false }` |
| A different layout | `layout="flat"` (no bubbles, everyone on one side), `density="compact"` |
| Change any wording, or translate | `strings` |
| Restyle one specific element | `plug-chat::part(bubble) { ... }` |
| Anything else about the look | your own CSS, `stylesheet="/my-chat.css"` |
| Add your own buttons, menu entries and message types | `actions`, `messageActions`, `headerActions`, `renderers`, slots |
| A completely different interface | the headless client: your UI, PlugChat's engine |

[CUSTOMIZING.md](CUSTOMIZING.md) is the full reference, with every token, part
name and feature switch.

## Step 5. Connect it to the rest of your platform

| You want to… | Use |
|---|---|
| Send push notifications or emails for new messages | `webhookUrl`: signed events to your backend |
| React to things in your own code (welcome messages, analytics, CRM sync) | `chat.on(event, fn)` and `plugins` (Node), or more `webhookEvents` |
| Check credits, moderate, or veto before a message is stored | hooks (`message.before`, ...), as functions or over HTTP |
| Use your existing call vendor (Twilio, Agora, Daily, LiveKit, Zoom, Jitsi) | the `call.join` hook |
| Keep uploads in your own S3, R2 or MinIO bucket | `storage: { type: 's3', ... }` |
| Create chats and post messages from your backend ("your order shipped") | the admin API |
| Give your staff a moderation screen | `/plugchat/admin` |

All of these are in [CONNECTORS.md](CONNECTORS.md).

## Step 6. Go live

```bash
npx plugchat doctor
```

checks the settings and says what must be fixed. The short list:

- `origins` set to your real site
- `studio` off
- HTTPS in front of it (your existing reverse proxy)
- the database: the built-in SQLite file, or your own PostgreSQL (`database`)
- the data folder on a disk that is backed up (`plugchat backup <folder>` makes
  a consistent copy while it runs)
- [SIZING.md](SIZING.md) for what one server handles

## What it costs to run

The software is free and nothing is metered. It runs on the server you already
have: one Node process and one folder of data. There is no account to create
and no service to call home to.
