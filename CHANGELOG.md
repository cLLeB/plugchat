# Changelog

Versions follow semantic versioning. What counts as a breaking change is set
out in [docs/STABILITY.md](docs/STABILITY.md). Until 1.0, a minor version may
contain breaking changes, and they are listed here.

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
