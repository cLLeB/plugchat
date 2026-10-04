# Connectors: using the services your platform already has

PlugChat is meant to sit beside what you already run and pay for, not replace
it. Four extension points let your own systems and third-party vendors take part.

| You already have… | Use | PlugChat's part |
|---|---|---|
| A call vendor (Twilio, Agora, Daily, LiveKit, Zoom, Jitsi…) | `call.join` hook | Decides who may join, rings members, keeps the call in the conversation |
| Billing, credits or a token wallet | `message.before`, `conversation.before`, `call.join` hooks | Asks you before the action happens and shows your refusal to the user |
| A moderation or compliance service | `message.before`, `upload.before` hooks | Blocks or rewrites content on your say-so |
| Object storage (S3, Azure Blob, GCS, MinIO) | `storage` adapter | Hands you the bytes, asks for them back |
| Push/SMS/email providers | `webhookUrl` | Tells you who needs notifying |
| Anything else (payments, orders, bookings) | custom messages, menu actions, admin API | Carries and displays it |

## Hooks

A hook is a question PlugChat asks your backend and waits on. Register hooks
either as functions (when PlugChat runs inside your Node server) or as an HTTP
endpoint (any language).

```js
// In-process
createPlugChat({
  secret,
  hooks: {
    'message.before': async ({ message, conversation }) => {
      if (!(await wallet.charge(message.senderId, 1))) return { allow: false, reason: 'You are out of credits' };
    },
  },
});
```

```bash
# Over HTTP, for a backend in any language
PLUGCHAT_HOOK_URL=https://your-site.example/internal/chat-hooks
PLUGCHAT_HOOK_EVENTS=message.before,call.join
```

HTTP hooks are POSTed as `{"event": "...", ...payload}` with an
`x-plugchat-signature` header (`sha256=` + hex HMAC-SHA256 of the raw body with
your secret). Verify it, then answer with JSON within 4 seconds (`hookTimeoutMs`).

| Event | Payload | Your answer |
|---|---|---|
| `message.before` | `message: {conversationId, senderId, kind, body, hasAttachment, mentions, viewOnce}`, `conversation: {id, type, encrypted, memberCount}` | `{allow: false, reason}` to refuse; `{body}` to replace the text; nothing to accept |
| `conversation.before` | `type`, `creatorId`, `memberIds`, `encrypted` | `{allow: false, reason}` or nothing |
| `upload.before` | `userId`, `conversationId`, `name`, `mime`, `size` | `{allow: false, reason}` or nothing |
| `call.join` | `call: {id, conversationId, startedBy, video}`, `userId`, `user`, `isStarter`, `memberIds` | `{url}` and/or `{data}` (required) |

Notes:

- `reason` is shown to the user as written.
- If your hook is unreachable or errors, the action is **refused** (HTTP 502).
  Set `hookFailOpen` / `PLUGCHAT_HOOK_FAIL_OPEN=on` to let actions through instead.
  Choose deliberately: fail-closed protects billing and moderation, fail-open protects availability.
- In end-to-end encrypted conversations `message.body` is ciphertext. You can
  still count, charge for and rate-limit messages, but you cannot read or rewrite them.
- Admin-token requests skip the `*.before` hooks.

## Calls through your own vendor

Registering a `call.join` hook switches calling from the built-in peer-to-peer
mode to yours, and enables calls in groups.

1. A user presses call. PlugChat checks membership and blocks, records the
   call, and asks your hook for that user's way in.
2. Your hook creates or looks up the vendor room for `call.id` and returns a
   join URL, a vendor token in `data`, or both. It is asked again for each
   person who joins, so every participant gets their own token. This is also
   the place to check and charge call credits.
3. PlugChat posts a call marker in the conversation; members who are online
   see a ringing prompt, everyone else finds a "Join" button in the thread.

```js
hooks: {
  'call.join': async ({ call, userId, user }) => ({
    // e.g. Twilio Video, Agora, LiveKit: mint a short-lived access token with your API key
    data: { vendor: 'livekit', room: call.id, token: await mintVendorToken(call.id, userId, user.name) },
    // or, for vendors with hosted rooms (Daily, Jitsi, Whereby, Zoom): a link
    url: `https://your-team.daily.co/${call.id}?t=${await dailyMeetingToken(call.id, userId)}`,
  }),
}
```

In the page:

- If you return a `url`, `<plug-chat>` opens it in a frame over the chat with
  camera and microphone permission. Nothing else to do.
- To use the vendor's own SDK and UI, handle the event and take over:

```js
chatEl.addEventListener('plugchat:call-join', (e) => {
  e.preventDefault();                       // PlugChat opens nothing
  const { callId, conversation, data } = e.detail;
  startMyVendorCall(data.room, data.token); // your existing call screen
});
```

Your vendor API keys never leave your backend; browsers only ever receive the
short-lived token your hook chose to give that one user.

## Storage

By default uploads are files in the data directory. To keep them elsewhere,
pass an object with three methods (Node only):

```js
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
const s3 = new S3Client({});
const Bucket = 'my-chat-uploads';

createPlugChat({
  secret,
  storage: {
    put: (id, data) => s3.send(new PutObjectCommand({ Bucket, Key: id, Body: data })),
    stream: async (id) => (await s3.send(new GetObjectCommand({ Bucket, Key: id }))).Body,
    remove: (id) => s3.send(new DeleteObjectCommand({ Bucket, Key: id })),
  },
});
```

Downloads still pass through PlugChat so that membership, view-once and
disappearing-message rules keep applying; the bucket should not be public.

## Your own message types and actions

Send structured messages the chat does not know about, and say how they look:

```js
// From your backend, with an admin token: POST /v1/conversations/:id/messages
// { "kind": "custom", "senderId": "kofi", "body": "{\"type\":\"payment\",\"data\":{\"amount\":50},\"text\":\"Kofi sent GHS 50\"}" }

// In the page
chatEl.renderers = {
  payment: (message) => {
    const card = document.createElement('div');
    card.textContent = `Payment of GHS ${message.custom.data.amount}`;
    return card;
  },
};
```

`text` is the fallback shown in previews, notifications and clients without a
renderer. Return a DOM node, built with `textContent`, not HTML strings from
user data.

Add entries to the attach menu that run your own flows:

```js
chatEl.actions = [{
  label: 'Send money',
  run: async ({ conversation, chat }) => {
    const receipt = await myPaymentsApi.pay(/* ... */);
    await chat.sendCustom(conversation.id, { type: 'payment', data: receipt, text: `Sent GHS ${receipt.amount}` });
  },
}];
```

## Acting from your backend

An admin token (`{"sub": "your-service", "admin": true}`) lets your servers do
anything a user could and more: provision users and their handles, create
groups for an event or an order, post system notices or messages on a user's
behalf, delete content, read reports, erase a user. See [API.md](API.md).
