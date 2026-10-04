# Security model

## Trust boundaries

| Party | Trusted for |
|---|---|
| Your backend | Saying who a user is. It holds the signing secret. |
| PlugChat server | Enforcing who may read and write what. For encrypted conversations it is **not** trusted with content. |
| A user's browser | That user's own messages and keys only. |

There is one secret. Anyone who has it can mint a token for any user, including
admin tokens, so keep it in server-side configuration only. To rotate it
without logging anyone out, start PlugChat with the new `secret` and the old
one in `previousSecrets`, switch your backend to sign with the new one, then
drop the old one. If the secret leaked, replace it outright instead: that
invalidates every outstanding token, and nothing else needs migrating.

The same secret signs outgoing webhooks and hook requests, which is how your
backend knows they came from PlugChat.

## Authentication

- Tokens are HS256 JWTs. The server ignores the token's own `alg` claim for
  anything other than HS256, so "alg: none" and algorithm-confusion tokens are rejected.
- `exp` is mandatory, and tokens valid for more than `maxTokenLifetimeSeconds`
  (24 hours by default) are refused. Issue short-lived tokens (about 10
  minutes); the client fetches a new one from your endpoint automatically.
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

- Each device (browser or phone) generates its own ECDH P-256 key pair with
  WebCrypto. The private key is non-extractable and stored in IndexedDB; script
  on the page can use it but cannot read it out.
- Each encrypted conversation has a random AES-256-GCM key per *epoch*. It is
  wrapped separately for every device of every member, using a key derived from
  ECDH between the wrapping device and the receiving one, through HKDF-SHA-256
  salted with the conversation id.
- **Several devices.** When someone signs in on a new device, any online device
  that holds the conversation keys (their own or another member's) wraps them
  for the new device, which can then read the history. A person can list and
  remove their devices.
- **Optional key backup.** A person can seal the conversation keys they hold
  under a passphrase and leave the sealed copy on the server. On a new device,
  the passphrase restores their encrypted history even if no other device is
  online. The device that enabled it keeps the backup current as keys change.
- **Key replacement when someone leaves.** Removing a member (or a member
  leaving) deletes their wrapped keys and marks the conversation; the server
  then refuses every message until a member starts a new epoch with a fresh key
  that the person who left is never given. Any member can also rotate at will.
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

- **A malicious server adding a device.** The list of each member's devices
  comes from the server, and members' devices hand conversation keys to any
  device on that list. A compromised server could therefore register a device
  of its own for a member and be given the keys. Two things make that visible
  rather than silent: the chat shows a warning in the conversation whenever a
  member has a device it has not seen before, and the safety code covers every
  device key. Both are detection, not prevention: the keys have already been
  handed over by the time the warning shows, and comparing codes is manual. This is the main reason not to describe
  the encryption as protecting against the platform operator unconditionally.
- **No forward secrecy within an epoch.** Keys are kept so history stays
  readable. Someone who obtains an epoch key and the stored ciphertext can read
  every message of that epoch. Rotation limits the damage to one epoch.
- **Past messages stay readable to someone who left.** They keep the keys for
  the epochs they were present for; the server stops serving them the
  ciphertext, which is access control, not cryptography.
- **A device that loses its storage loses its keys** (cleared browser data,
  private windows). It is treated as a new device and waits for another device
  to be online to hand over the keys, unless the person turned on the
  passphrase backup below.
- **A weak backup passphrase.** The optional key backup is sealed with a key
  stretched from the person's passphrase (PBKDF2-SHA-256, 600,000 rounds) and
  stored on the server. The server cannot open it, but whoever holds that copy
  can try passphrases against it offline, so its strength is the passphrase's.
  A forgotten passphrase cannot be recovered by anyone.
- **The page itself.** Chat runs inside your site. Script injected into your
  page (XSS, a compromised dependency) can read what the user can read. A strict
  Content-Security-Policy on the host site matters.
- Stories and call signalling are not end-to-end encrypted. Call media is
  encrypted in transit by WebRTC (DTLS-SRTP), with keys negotiated through the server.

The planned route to closing the first two is the IETF Messaging Layer
Security protocol (RFC 9420), together with verified device lists.

## Privacy controls

Each person can turn off read receipts (others never learn what they have
read) and online status (they are never announced or listed as online). The
host can suspend an account: a suspended person can still read but cannot send,
upload, react or call.

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
- Back up the data directory, and set `userStorageBytes` to cap what each
  person may upload.
- The default call configuration uses a public STUN server, which sees
  participants' IP addresses. Configure your own STUN/TURN if that matters.
