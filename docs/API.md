# API reference

Everything is under the base path (default `/plugchat`). Send
`Authorization: Bearer <token>` on every REST request. Bodies and responses are
JSON. Errors look like `{"error": "code", "message": "..."}`.

Changes are made over REST; the WebSocket only delivers events (plus typing and
call signalling). That keeps a native or server-side integration to plain HTTP.

"Admin" marks endpoints that need a token with `admin: true`.

## Users

| | |
|---|---|
| `GET /v1/me` | The caller, with their handles and the server's enabled features |
| `PUT /v1/me/key` `{deviceId, publicKey}` | Register this device's encryption key |
| `GET /v1/me/devices`, `DELETE /v1/me/devices/:deviceId` | The caller's devices; remove a lost one |
| `PUT /v1/me/settings` `{readReceipts?, presence?}` | Privacy switches |
| `GET` / `PUT` / `DELETE /v1/me/backup` | The caller's passphrase-sealed key backup: `{salt, data}`, opaque to the server |
| `GET /v1/users?q=` | Search by name (substring) or handle (exact). Needs the directory on |
| `GET /v1/users/lookup?handle=&kind=` | Exact lookup by email, phone, username or custom kind |
| `GET /v1/users/:id` | Profile and online state |
| `GET /v1/users/:id/devices` | That person's device keys, to set up encryption with them |
| `PUT /v1/users/:id/suspension` `{suspended, reason?}` | **Admin.** Suspend or reinstate. Suspended people can read but not write |
| `POST /v1/users/:id/notify` `{text, title?}` | **Admin.** Post a notice into that person's read-only "Notifications" conversation |
| `GET /v1/reports`, `DELETE /v1/reports/:id` | **Admin.** Reported messages; dismiss one |
| `GET /v1/users/:id/unread` | **Admin.** `{total, conversations}` for your own email or push digests |
| `GET /v1/stats` | **Admin.** Counts of users, conversations, messages, files and bytes stored |
| `PUT /v1/users/:id` `{name, avatar, handles}` | **Admin.** Create or update a user ahead of their first visit |
| `DELETE /v1/users/:id` | **Admin.** Erase the user and everything they sent |
| `GET /v1/me/export` | Everything held about the caller: profile, memberships, sent messages, reactions, stories, files |
| `GET /v1/users/:id/export` | **Admin.** The same for any user |
| `GET /v1/blocks`, `PUT /v1/blocks/:id`, `DELETE /v1/blocks/:id` | The caller's block list |

## Conversations

| | |
|---|---|
| `GET /v1/conversations` | The caller's conversations, with last message and unread count |
| `POST /v1/conversations` | Create. `{type: "dm", memberIds: [other]}` returns the existing one if there is one. `{type: "group", title, memberIds, announce?, description?, ttlSeconds?}`. Encrypted: add `id` (a UUID you generate), `encrypted: true`, `keys: {userId: wrappedKey}` |
| `GET /v1/conversations/:id` | One conversation |
| `PATCH /v1/conversations/:id` `{title?, description?, announce?, ttlSeconds?}` | Group admins; either member of a dm may set `ttlSeconds` |
| `PUT /v1/conversations/:id/settings` `{muted?, archived?, pinned?}` | Private to the caller |
| `POST /v1/conversations/:id/members` `{userIds, keys?}` | Add members (group admins) |
| `PATCH /v1/conversations/:id/members/:userId` `{role}` | `admin`, `member`, or `owner` to hand the group over (owner only) |
| `POST /v1/conversations/:id/keys` `{keys}` | Encrypted: give wrapped keys to member devices that have none. Never overwrites |
| `POST /v1/conversations/:id/rotate` `{epoch, keys}` | Encrypted: start the next key epoch. Required after a member leaves |
| `DELETE /v1/conversations/:id/members/:userId` | Remove a member, or leave by naming yourself |
| `POST /v1/conversations/:id/read` `{seq}` | Mark read up to a message's `seq` |
| `GET /v1/conversations/:id/pins` | Pinned messages |
| `POST /v1/conversations/:id/invites` `{ttlSeconds?, maxUses?}` | Create an invite code (group admins; not for encrypted groups). Default lifetime 7 days |
| `GET /v1/conversations/:id/invites`, `DELETE /v1/conversations/:id/invites/:code` | List and revoke |
| `GET /v1/invites/:code` | What the code leads to: `{title, description, memberCount, alreadyMember}` |
| `POST /v1/invites/:code/join` | Join; returns the conversation |

Admin tokens may create conversations among any users (`memberIds` is then the
complete list, `createdBy` optional).

## Messages

| | |
|---|---|
| `GET /v1/conversations/:id/messages?limit=` | A page, oldest first (default 50, max 200). No range: the latest. `before=<seq>` / `after=<seq>` page backwards and forwards; `around=<seq>` returns the messages either side of one |
| `GET /v1/messages/:id` | One message |
| `PUT` / `DELETE /v1/messages/:id/star`, `GET /v1/starred` | Private bookmarks |
| `POST /v1/conversations/:id/messages` | Send (see below) |
| `PATCH /v1/messages/:id` `{body}` | Edit your own text message |
| `DELETE /v1/messages/:id` | Delete (author, group admin, or admin token) |
| `PUT` / `DELETE /v1/messages/:id/reactions/:emoji` | React |
| `PUT` / `DELETE /v1/messages/:id/pin` | Pin |
| `PUT /v1/messages/:id/vote` `{options: [index]}` | Vote in a poll (replaces your previous vote) |
| `POST /v1/messages/:id/open` | Open a view-once message. Returns its content once, then `410` |
| `POST /v1/messages/:id/report` `{reason}` | Report to the platform's moderators |
| `GET /v1/search?q=&conversationId=` | Search your non-encrypted conversations |
| `GET /v1/reports` | **Admin.** Reported messages |

Sending:

```json
{
  "kind": "text",
  "body": "Hello @Ama",
  "replyTo": "<message id>",
  "attachment": { "fileId": "<from upload>" },
  "mentions": ["ama"],
  "viewOnce": false,
  "forwarded": false,
  "clientId": "<your unique id, makes retries safe>"
}
```

- `kind: "poll"` — `body` is `{"question": "...", "options": ["A", "B"]}` as a
  JSON string, plus `"poll": {"options": 2, "multi": false}`.
- `kind: "location"` — `body` is `{"lat": 5.6, "lng": -0.18, "label": "..."}` as a JSON string.
- `kind: "custom"` — `body` is `{"type": "...", "data": {...}, "text": "fallback"}` as a JSON string.
- `kind: "system"` — admin tokens only; shown as a centred notice. Admin tokens
  may also set `senderId`.
- In encrypted conversations `body` must be ciphertext, `e1.<key epoch>.<base64>`.
  The server cannot read it, but refuses anything not on the current epoch
  (`409 stale_epoch`) and everything while a key replacement is due
  (`409 rotation_required`).

A message:

```json
{
  "id": "…", "conversationId": "…", "seq": 12, "senderId": "kofi", "kind": "text",
  "body": "Hello", "replyTo": null, "attachment": null, "createdAt": 1790000000000,
  "editedAt": null, "deleted": false, "expiresAt": null, "reactions": { "👍": ["ama"] },
  "mentions": [], "forwarded": false, "pinned": null
}
```

Polls add `poll` and `votes`; view-once messages add `viewOnce`, `hasFile`,
`openedBy`, `consumed` and arrive with an empty `body`.

## Files

| | |
|---|---|
| `POST /v1/conversations/:id/files` | Raw bytes as the body. Headers: `Content-Type`, `X-Filename` (URI-encoded). Returns `{fileId, name, mime, size}` to attach to a message |
| `POST /v1/files` | Same, for a story |
| `GET /v1/files/:id` | Download. Members of the conversation only |

## Stories

| | |
|---|---|
| `GET /v1/stories` | Live stories from you and the people you share conversations with, grouped by author |
| `POST /v1/stories` `{text?, attachment?, ttlSeconds?}` | Post. Default lifetime 24 hours |
| `POST /v1/stories/:id/view` | Record that you saw it |
| `DELETE /v1/stories/:id` | Remove your own |

## Calls

Built-in peer-to-peer calls: `GET /v1/ice` returns `{iceServers}` for
`RTCPeerConnection`. Signalling goes over the WebSocket; see `client/calls.js`.

Calls through your own vendor (when a `call.join` hook is registered, see
[CONNECTORS.md](CONNECTORS.md)):

| | |
|---|---|
| `POST /v1/conversations/:id/calls` `{video}` | Start a call. Returns `{call, message, join}` and posts a `kind: "call"` message |
| `POST /v1/calls/:id/join` | Returns `{call, join}` with this user's `url` and/or `data` |

## Realtime

Connect to `ws(s)://…/plugchat/v1/ws` and send `{"type": "auth", "token": "…"}`
within 10 seconds. Send `auth` again with a fresh token before the old one expires.

Client to server:

| | |
|---|---|
| `{type: "auth", token}` | Authenticate or re-authenticate |
| `{type: "typing", conversationId}` | Tell other members you are typing |
| `{type: "signal", conversationId, to, data}` | Call setup, relayed to one member |

Server to client:

| Event | Payload |
|---|---|
| `ready` | `userId`, `online` (ids of contacts currently online) |
| `message.new`, `message.updated` | `message` |
| `message.deleted` | `conversationId`, `messageId`, `expired?` |
| `reaction` | `conversationId`, `messageId`, `reactions` |
| `read` | `conversationId`, `userId`, `seq` |
| `star` | `conversationId`, `messageId`, `starred` (sent only to the person's own devices) |
| `typing` | `conversationId`, `userId` |
| `presence` | `userId`, `online`, `lastSeen?` |
| `conversation.new`, `conversation.updated` | `conversation` (as seen by the recipient) |
| `conversation.removed` | `conversationId` |
| `story.new`, `story.deleted`, `story.viewed` | `userId`, `storyId` |
| `signal` | `conversationId`, `from`, `data` |
| `user.deleted` | `userId` |

## Pages

| | |
|---|---|
| `GET /embed` | The chat as a standalone page for iframes and WebViews (see [INTEGRATION.md](INTEGRATION.md)) |
| `GET /client/element.js`, `launcher.js`, `plugchat.js`, `calls.js`, `e2ee.js` | The web component, floating launcher and headless client |
| `GET /health` | `{ok: true}` |

## Webhooks

POSTed to `webhookUrl` with header `x-plugchat-signature: sha256=<hex HMAC-SHA256 of the raw body>`.

`message.new`:

```json
{
  "type": "message.new",
  "message": { "…": "…" },
  "conversation": { "id": "…", "type": "group", "title": "Reunion", "encrypted": false },
  "recipients": [{ "userId": "ama", "online": false, "muted": false, "mentioned": true }]
}
```

`message.reported`: `reportId`, `reporterId`, `reason`, `message`, `conversation`.

`call.started`: `call`, `message`, `conversation`, `recipients` (so you can ring phones that are not in the app).

Events are queued in the database and retried until your endpoint answers with
a 2xx status: after 5 seconds, then doubling, up to 8 attempts, after which
the event is dropped and logged. Each delivery carries `x-plugchat-delivery`
(the same id on every retry of one event, so you can ignore repeats) and
`x-plugchat-attempt`. Answer within 5 seconds.
