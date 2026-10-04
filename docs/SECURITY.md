# Security model

## Trust boundaries

| Party | Trusted for |
|---|---|
| Your backend | Saying who a user is. It holds the signing secret. |
| PlugChat server | Enforcing who may read and write what. For encrypted conversations it is **not** trusted with content. |
| A user's browser | That user's own messages and keys only. |

There is one secret. Anyone who has it can mint a token for any user, including
admin tokens, so keep it in server-side configuration only and rotate it if it
leaks (rotating invalidates all outstanding tokens; nothing else needs migrating).

## Authentication

- Tokens are HS256 JWTs. The server ignores the token's own `alg` claim for
  anything other than HS256, so "alg: none" and algorithm-confusion tokens are rejected.
- `exp` is mandatory. Issue short-lived tokens (about 10 minutes); the client
  fetches a new one from your endpoint automatically.
- The realtime socket authenticates with its first message rather than a URL
  parameter, so tokens do not end up in proxy or access logs. The server closes
  a socket at the moment its token expires unless the client has re-authenticated.
- `admin: true` tokens bypass membership checks and may post as any user. They
  are for your backend only.

## Authorisation

Every endpoint checks membership of the conversation involved. Requests about a
conversation, message or file the caller cannot access return 404, the same as
for one that does not exist, so identifiers cannot be probed.

Group roles: the creator is `owner`; owners appoint `admin`s; only owners and
admins add or remove members, rename, change timers, and delete other people's
messages. In announcement channels only they can post or pin.

With `directory: false`, users cannot list or search the user base and cannot
fetch the profile of anyone they do not already share a conversation with.
Handles (email, phone, ...) are matched **exactly** only, and are not shown to
other users unless `handleVisibility: 'all'`.

## End-to-end encryption

What is implemented:

- Each device generates an ECDH P-256 key pair with WebCrypto. The private key
  is non-extractable and stored in IndexedDB; script on the page can use it but
  cannot read it out.
- Each encrypted conversation has one random AES-256-GCM key. It is wrapped
  separately for every member using a key derived from ECDH between the wrapper
  and that member, through HKDF-SHA-256 salted with the conversation id.
- Message bodies, poll questions and options, shared locations, attachment
  bytes and attachment names/types are encrypted with the conversation key. The
  conversation id is bound in as associated data.
- The server rejects any non-ciphertext body sent to an encrypted conversation.
- Members can compare a **safety code** (a digest of all members' public keys)
  out of band to detect a substituted key.

What the server still sees for encrypted conversations: who is in them, who
sent each message and when, message sizes, reactions, poll vote counts, read
positions, and mention targets.

What it does **not** protect against yet:

- **A malicious server substituting keys.** Public keys are distributed by the
  server. Unless members compare safety codes, a compromised server could hand
  out its own key for a member. This is the same trust-on-first-use limit most
  messengers have, but here verification is manual and optional.
- **No forward secrecy.** The conversation key is long-lived. Someone who
  obtains it and has the stored ciphertext can read past messages.
- **No rotation on removal.** A removed member keeps the key they had. They no
  longer receive new ciphertext from the server, but the key is not changed.
- **One device per person.** Opening chat on a second browser creates a new
  identity key; that device cannot read conversations keyed to the first, and
  it replaces the published key.
- **The page itself.** Chat runs inside your site. Script injected into your
  page (XSS, a compromised dependency) can read what the user can read. A strict
  Content-Security-Policy on the host site matters.
- Stories and call signalling are not end-to-end encrypted. Call media is
  encrypted in transit by WebRTC (DTLS-SRTP), with keys negotiated through the server.

The planned route to closing the first four is the IETF Messaging Layer
Security protocol (RFC 9420) with multi-device support.

## Ephemeral content

- **Disappearing messages** are hard-deleted from the database, with their
  files, when their timer passes, and are filtered from reads the instant they expire.
- **View-once** content is withheld by the server until a recipient opens it,
  released to each recipient once, and wiped when every recipient has opened it.
  The sender cannot reopen it. Nothing can stop a recipient photographing their screen.
- Deleting a message wipes its content and file and leaves a tombstone.
- `DELETE /v1/users/:id` erases a user's messages, files, reactions, votes,
  stories and direct conversations.

## Files

Uploads are stored under random ids and are always served as
`application/octet-stream` with `nosniff`, a `sandbox` Content-Security-Policy
and `Content-Disposition: attachment`. The client turns them into local blobs,
and only renders a fixed list of image, audio and video types inline. An
uploaded HTML or SVG file can therefore never execute on your origin.

## Abuse controls

- Writes are rate limited per user (default 5 per second, burst 30).
- JSON bodies are capped at 256 KB, messages at 32,000 characters, uploads at
  10 MB by default.
- Users can block each other (stops direct messages and calls) and report
  messages; reports are stored and sent to your webhook.

## Operating it safely

- Serve everything over HTTPS; WebCrypto and calls require it outside localhost.
- Set `origins` to your site's origin(s) rather than `*`.
- Put PlugChat behind your reverse proxy and apply connection limits there;
  unauthenticated connection floods are not handled in-process.
- Back up the data directory. There is no per-user storage quota yet.
- The default call configuration uses a public STUN server, which sees
  participants' IP addresses. Configure your own STUN/TURN if that matters.
