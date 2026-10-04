# Changelog

Versions follow semantic versioning. What counts as a breaking change is set
out in [docs/STABILITY.md](docs/STABILITY.md). Until 1.0, a minor version may
contain breaking changes, and they are listed here.

## 0.1.6

- No code changes. Releases now publish to npm through trusted publishing, with
  no stored token. Supersedes 0.1.5, which was tagged but never published.

## 0.1.5

- No code changes. The first version published to npm by the release workflow;
  it carries everything since 0.1.1.

## 0.1.4

- The moderation console, the setup studio and the demo site's pages follow
  the light or dark look chosen in the chat on that device.
- The getting-started guide explains how a platform's users appear in chat.

## 0.1.3

- Setup studio: choose how the chat appears (a page, a floating button or a
  frame) and see each one working, with the matching embed code.
- Demo site: a visitor arrives already signed in as a member; the gear holds
  only what members need, plus one line pointing developers to the studio.

## 0.1.2

- Shared devices: if the host's token names a different person than before,
  the chat drops everything on screen and starts afresh as the new person; if
  the token endpoint answers 401, it clears itself. `restart()` does the same
  on request. The client reports both as `identity` and `auth` events.
- A Privacy page in Settings: what others can see, blocked people, and who can
  read your messages, with a link to the host's own policy (`ui.privacyUrl`).
- The demo site has a real sign-in and sign-out with a signed session, a gear
  menu that explains its staff and developer pages, and a privacy page.

## 0.1.1

- Machine-readable API description: `docs/openapi.json`, also served at
  `/plugchat/openapi.json`. Five endpoints the reference described wrongly or
  not at all are corrected.
- The member routes name their path parameter `userId` (was `uid`); the URLs
  themselves are unchanged.
- Bucket storage is now checked end to end against a real S3-compatible
  server; `scripts/check-s3.mjs` runs the same check against your bucket.
- The embed page's bridge to React Native, Android, Flutter and iOS is tested.
- Built-in peer-to-peer calls and the mobile WebView components are labelled
  experimental.
- Linux, both databases, all starters, the nginx deployment and the container
  image are checked on every push.

## 0.1.0

First release.

- Server: one Node process, mounted in a Node server or run beside a backend
  in any language. SQLite by default, PostgreSQL optional. Tokens signed by
  the host (HS256), membership checks on every read and write, rate limiting,
  signed webhooks with retries, hooks, events, plugins, 30 feature switches,
  uploads on disk or in an S3-compatible bucket.
- Interface: `<plug-chat>` and `<plug-chat-launcher>` web components, React and
  Vue components, an embed page for iframes and WebViews, a headless client.
  Design tokens, part names, slots, custom actions, two layouts, five
  languages, and per-person appearance settings.
- Messaging: one-to-one and group chats, channels, replies, edits, reactions,
  mentions, pins, stars, polls, location, files, voice notes, view-once,
  disappearing messages, scheduled messages, stories, invite codes, search,
  end-to-end encryption, one-to-one calls, and calls through the host's vendor.
- For developers: `plugchat init`, `doctor`, `backup`; a setup studio; backend
  starters in seven languages with a verifier; examples for a Node host, a PHP
  site behind nginx, and React and Vue apps; a load test.
