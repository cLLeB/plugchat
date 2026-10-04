# PlugChat

In-app messaging you add to a platform that already exists. Your users, your
login, your servers, your database file. PlugChat supplies the chat.

```html
<script type="module" src="https://your-site.example/plugchat/client/element.js"></script>
<plug-chat server="/plugchat" token-url="/api/chat-token"></plug-chat>
```

That tag plus one small endpoint on your backend is the whole integration.

## Why this exists

| | Hosted chat APIs (Stream, Sendbird, CometChat, TalkJS) | Self-hosted chat servers (Matrix, Rocket.Chat, Tinode) | PlugChat |
|---|---|---|---|
| Who runs it | The vendor | You | You, as one small process |
| Cost | Per monthly active user, from roughly $90 to $500 a month | Free, but heavy to operate | Free; nothing is billed per user |
| Where messages live | Vendor's cloud | Your servers | Your servers |
| User accounts | Synced to the vendor | A second account system to bridge | None of its own: it trusts a token your backend signs |
| End-to-end encryption | Rare | Matrix yes, others partial | Built in, per conversation |
| Work to integrate | SDK per platform plus user sync | Significant | One endpoint and one HTML tag |

PlugChat has no user table to sync, no passwords, and no vendor in the middle.
Whoever your platform says is logged in is who PlugChat sees.

## How it works

1. **Run it** next to your app: mounted inside a Node server, or as a standalone
   process/container beside a backend in any other language.
2. **Sign a token.** Your backend already knows who is logged in. It signs a
   short-lived JWT naming that user with a secret only it and PlugChat know.
3. **Drop in the UI.** `<plug-chat>` is a standard web component, so it works in
   React, Vue, Angular, Svelte, plain server-rendered pages and mobile WebViews.
   Prefer your own UI? Use the headless client or the REST and WebSocket API directly.

## Try the demo

```bash
npm install
```

```bash
npm run demo
```

Open http://localhost:3000, sign in as one member, then open a private window
and sign in as another. The demo is a pretend alumni-association site; the only
chat-specific code in it is one endpoint and one tag
([examples/host-app](examples/host-app/server.js)).

```bash
npm test
```

## Features

**Conversations** — one-to-one chats, groups with owner/admin/member roles,
announcement channels where only admins post, per-person mute, archive and pin.

**Messages** — replies, edits, deletes, emoji reactions, @mentions, forwarding,
pinned messages, polls, location sharing, read receipts, typing indicators,
online presence, unread counts, search.

**Media** — photos, files, inline audio and video, voice notes, several
attachments at once, a full-size photo viewer, and a per-conversation view of
everything that was shared.

**Ephemeral** — disappearing-message timers per conversation, view-once
messages that are wiped after each recipient opens them, 24-hour stories.

**Calls** — one-to-one voice and video over WebRTC, peer to peer; or one-to-one
and group calls through the call vendor you already use.

**Connectors** — plug in what your platform already has: a call vendor
(Twilio, Agora, Daily, LiveKit, Zoom, Jitsi), billing or credit checks, a
moderation service, your own object storage, and your own message types and
menu actions (payments, orders, bookings).

**Identity** — people are found by whatever your platform uses: user id, email,
phone number, username, or custom kinds such as a membership number.

**Everyday comfort** — drafts kept per conversation, an @-mention picker,
messages that appear instantly and offer a retry if they fail, drag-and-drop
and paste for attachments, a "new messages" line where you left off, desktop
notifications, last seen.

**For your moderators** — a ready-made console page for reports, suspensions
and usage figures.

**Personal** — starred messages, read-receipt and online-status privacy
switches, a list of your devices, download of your own data.

**History** — jump to any message from search, pins, stars or a reply, however
far back it is.

**Groups that grow themselves** — invite codes your site can turn into its own
join links.

**Safety and compliance** — blocking, reporting to your moderators, admin API to
remove content, per-user data export, and erasure of a user's data.

**Four ways to embed** — a page component, a floating button with an unread
badge, an iframe for site builders, and a WebView page for native mobile apps.

**For the host platform** — signed webhooks so you send push notifications or
email through your own providers; DOM events (`plugchat:unread`,
`plugchat:message`) for badges; theming through CSS variables.

## Security

- No accounts or passwords of its own. Every request carries a token signed by
  your backend; the algorithm is pinned to HS256 and tokens must expire.
- Every read and write is checked against conversation membership. A
  conversation you are not in is indistinguishable from one that does not exist.
- **End-to-end encryption** per conversation: keys are generated on each
  device, private keys are non-extractable, and the server stores only
  ciphertext for messages and attachments. It works across a person's devices,
  the key is replaced when someone leaves, and an optional passphrase backup
  restores history on a new device. The server refuses plaintext
  sent to an encrypted conversation.
- Uploads are never served as a renderable type, so a malicious file cannot run
  as a page on your domain.
- Per-user write rate limiting, body size caps, origin allow-list for browsers.
- Realtime sockets authenticate in the first frame (never in the URL) and are
  closed when their token expires.

Read [docs/SECURITY.md](docs/SECURITY.md) for the threat model and, importantly,
what the encryption does **not** yet protect against.

## Documentation

- [docs/INTEGRATION.md](docs/INTEGRATION.md) — running it, signing tokens in
  Node, Python, PHP, Go, Ruby, Java and C#, embedding in web and mobile apps.
- [docs/CONNECTORS.md](docs/CONNECTORS.md) — call vendors, billing and moderation
  hooks, external storage, custom message types.
- [docs/API.md](docs/API.md) — REST endpoints, realtime events, webhooks.
- [docs/SECURITY.md](docs/SECURITY.md) — threat model and limits.

## Current limits

Stated plainly so you can plan around them:

- **SQLite storage only.** Data lives in one file on your server. Several
  PlugChat instances can share it (`cluster: true`) when they can all reach the
  same file, which in practice means the same machine or a volume that supports
  SQLite locking. There is no Postgres or MySQL backend: all SQL is in
  `server/store.js`, but it is written against a synchronous API and has not
  been ported.
- **Encryption trusts the server's device list** unless members compare safety
  codes, and has no forward secrecy within a key epoch. See the security doc.
- **Built-in calls are one-to-one**, and need a TURN server of yours to connect
  across strict networks. Group calls need your own call vendor (see connectors).
- **No native mobile SDKs.** Mobile apps open the embed page in a WebView or
  call the REST/WebSocket API.
- **Push notifications are yours to send**, driven by the webhook.
- **The interface ships in English, French, Spanish, Portuguese and Arabic**
  (with a mirrored right-to-left layout). The translations are mine and have
  not been reviewed by native speakers. Other languages are added by the host
  through `strings`.
- **Not yet exercised here:** the Dockerfile, the token snippets for languages
  other than Node, the native WebView bridges, and calls between two real
  devices on different networks (the call flow is tested in one browser with
  synthetic media). Treat those as written to spec, not proven.
- **No license has been chosen**, so nobody else may legally use the code yet.
