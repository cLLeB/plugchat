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
| `PUT /v1/me/key` `{publicKey}` | Publish this device's encryption key |
| `GET /v1/users?q=` | Search by name (substring) or handle (exact). Needs the directory on |
| `GET /v1/users/lookup?handle=&kind=` | Exact lookup by email, phone, username or custom kind |
| `GET /v1/users/:id` | Profile and online state |
| `GET /v1/users/:id/key` | Public encryption key |
| `PUT /v1/users/:id` `{name, avatar, handles}` | **Admin.** Create or update a user ahead of their first visit |
| `DELETE /v1/users/:id` | **Admin.** Erase the user and everything they sent |
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
| `PATCH /v1/conversations/:id/members/:userId` `{role}` | `admin` or `member` (owner only) |
| `DELETE /v1/conversations/:id/members/:userId` | Remove a member, or leave by naming yourself |
| `POST /v1/conversations/:id/read` `{seq}` | Mark read up to a message's `seq` |
| `GET /v1/conversations/:id/pins` | Pinned messages |

Admin tokens may create conversations among any users (`memberIds` is then the
complete list, `createdBy` optional).

## Messages

| | |
|---|---|
| `GET /v1/conversations/:id/messages?before=<seq>&limit=` | A page, oldest first. Default 50, max 200 |
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
- In encrypted conversations `body` must be ciphertext (`e1.` prefix); the
  server cannot check its contents.

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
| `typing` | `conversationId`, `userId` |
| `presence` | `userId`, `online`, `lastSeen?` |
| `conversation.new`, `conversation.updated` | `conversation` (as seen by the recipient) |
| `conversation.removed` | `conversationId` |
| `story.new`, `story.deleted`, `story.viewed` | `userId`, `storyId` |
| `signal` | `conversationId`, `from`, `data` |
| `user.deleted` | `userId` |

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

Delivery is fire-and-forget with a 5 second timeout; there are no retries.
