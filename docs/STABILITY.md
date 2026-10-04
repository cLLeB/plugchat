# What you can build on

A platform that integrates PlugChat writes code and CSS against it. This page
says which parts are a promise and which are free to change, so an upgrade
does not break an integration by surprise.

## The rule

PlugChat follows semantic versioning. Within a major version, everything
listed under **Stable** keeps working. Removing or changing any of it needs a
new major version and a note in the release. Until 1.0, a minor version
(0.x) plays the role of a major one.

The list below is not only documentation: `test/contract.test.js` holds the
same names, and the test suite fails if any of them disappears.

## Stable

| Surface | What is promised |
|---|---|
| **Token** | HS256 JWT; claims `sub`, `exp`, `name`, `avatar`, `email`, `phone`, `username`, `handles`, `admin` |
| **Signatures** | `x-plugchat-signature: sha256=<hex HMAC-SHA256 of the raw body>` on webhooks and hooks |
| **REST and WebSocket** | Every path under `/v1` in [API.md](API.md), its method, and the fields documented there. New fields and endpoints may be added |
| **Events** | The ten event names, and their documented fields |
| **Hooks** | The five hook names, what they receive, and what their answers mean |
| **Feature switches** | The names in [CUSTOMIZING.md](CUSTOMIZING.md). A new switch always starts on |
| **Settings** | Option names, `plugchat.config.json` keys and environment variable names |
| **Element** | The tags `plug-chat` and `plug-chat-launcher`; their attributes, properties, events and slots |
| **Design tokens** | Every `--pc-*` variable in the tokens table |
| **Part names** | Every `::part()` name in the parts table |
| **Components** | The props and events of `plugchat/react` and `plugchat/vue` |
| **Embed page** | `/embed`, its query options, and the `plugchat:*` messages it exchanges |
| **Headless client** | The methods and events declared in `client/plugchat.d.ts` |
| **Command line** | `init`, `start`, `secret`, `token`, `backup`, `doctor` |
| **Database** | Upgrades migrate the data in place; a newer version always opens an older database |

## Not stable

These can change in any release. Avoid depending on them, or pin your version
if you do.

- **Default values of design tokens and the default layout.** The look may be
  refreshed. To keep yours fixed, set the tokens and `layout` you care about
  explicitly (the setup studio writes them out for you).
- **CSS class names and the structure inside the element.** Style through
  tokens and parts. Custom CSS that targets class names (`ui.css`, `css`,
  `stylesheet`) works, but is yours to re-check after an upgrade.
- **The English wording of interface text.** Keys in `strings` are the English
  text, so a reworded label needs its override renamed. The translation test
  lists every key in use.
- **Icon drawings**, **the setup studio**, **the moderation console's layout**
  and anything under `examples/`, `bench/` and `starters/` (those are yours to
  copy and change).
- **Anything named with a leading underscore**, and the SQL tables. Read data
  through the API, not from the database.

## Checking an upgrade

```bash
npm test
```

in the new version runs the contract test. On your side, the pieces that touch
PlugChat are few: the token endpoint, the webhook receiver, any hooks, and the
page that shows the chat. `node starters/verify.mjs` shows how each of the
backend pieces is checked against a real PlugChat; the same three checks apply
to your own endpoints.
