# Customising PlugChat

How far a platform can bend the chat to fit its product: every colour, size,
piece of text and icon; which features exist at all; and where your own
buttons, menu entries, message types and content go.

The quickest way to explore all of this is the **setup studio**
(`studio: true`, then open `/plugchat/studio`): move the controls, watch the
real chat change, copy the result.

## Where settings go

There are two places, and they stack:

| Place | Applies to | Set by |
|---|---|---|
| **Server** — the `ui` and `features` options (or `plugchat.config.json`) | every page, iframe and app that shows the chat | whoever runs PlugChat |
| **Page** — attributes, properties and CSS on the `<plug-chat>` element | that page only | the page's developer |

The page refines what the server says, with one rule: a feature the server
switched off cannot be switched back on from a page.

```json
{
  "features": { "stories": false, "polls": false },
  "ui": {
    "theme": { "accent": "#0b6b4f", "bubbleRadius": "8px", "font": "Inter, sans-serif" },
    "dark": { "bg": "#101413" },
    "layout": "flat",
    "density": "comfortable",
    "heading": "Member messages",
    "strings": { "New chat": "New conversation" },
    "reactions": ["👍", "🎓", "❤️", "😂"],
    "css": ".bubble { box-shadow: none; }"
  }
}
```

The same from a page:

```html
<plug-chat server="/plugchat" token-url="/api/chat-token" layout="flat" density="compact" heading="Member messages"></plug-chat>
<style>
  plug-chat { --pc-accent: #0b6b4f; --pc-bubble-radius: 8px; --pc-font: Inter, sans-serif; }
</style>
<script type="module">
  const chat = document.querySelector('plug-chat');
  chat.features = { stories: false, polls: false };
  chat.strings = { 'New chat': 'New conversation' };
</script>
```

## Switching features on and off

Everything is on unless you say otherwise. A feature that is off is refused by
the server (`404`, code `feature_disabled`) and its buttons, menu entries and
settings disappear from the interface. Your own backend, using an admin token,
is not restricted by these switches.

| Feature | What goes away when it is off |
|---|---|
| `groups` | Creating group chats (existing ones stay; your backend can still create them) |
| `directory` | Browsing people by name (finding by exact email, phone or username still works) |
| `files` | Attachments of every kind, the camera button, the media view |
| `voiceNotes` | The microphone button |
| `reactions` | Emoji reactions |
| `replies` | Reply and swipe-to-reply |
| `editing` | Editing a sent message |
| `deleting` | Deleting your own message (moderators still can) |
| `forwarding` | Forward |
| `mentions` | The @-mention picker and highlighting |
| `pins` | Pinned messages |
| `stars` | Starred messages |
| `search` | Searching message text (the chat-list filter stays) |
| `polls` | Polls |
| `location` | Location sharing |
| `viewOnce` | View-once messages |
| `disappearing` | Disappearing-message timers |
| `scheduled` | Send later |
| `stories` | Stories |
| `calls` | Voice and video calls (the built-in peer-to-peer ones are experimental; calls through your own vendor are not) |
| `encryption` | Creating end-to-end encrypted conversations |
| `invites` | Invite codes |
| `reports` | Reporting a message to your moderators |
| `profiles` | People changing their own picture and about line (pictures from your tokens still show) |
| `typing` | Typing indicators |
| `presence` | Online status and last seen |
| `readReceipts` | Read ticks, "seen by" pictures and message info |
| `blocking` | Blocking another person |
| `export` | Chat export and "download my data" |
| `personalization` | Each person's own appearance choices (see below); everyone then sees exactly the look you configured |

Server: `features: { polls: false }`, or `PLUGCHAT_FEATURES_OFF=polls,stories`.
Page: `chat.features = { polls: false }`.

## What each person can change for themselves

In Settings → Appearance, every person can pick their own look, kept on their
device and applied on top of yours: light or dark, a colour (nine presets or
any colour they choose), a gradient or a solid colour on their own messages,
bubbles or the flat style, comfortable or compact spacing, a plain, dotted or
grid backdrop, the text size, and how round the corners are. "Reset
appearance" returns them to your look. Switch all of it off with
`features: { personalization: false }` if your brand must look the same for everyone.

## Design tokens

Each token is a CSS variable on the element, and a key under `ui.theme` on the
server (`accentFg` or `accent-fg`, both work).

| Token | CSS variable | Default (light) | What it controls |
|---|---|---|---|
| `accent` | `--pc-accent` | `#4e5058` (gray) | Your brand colour: buttons, badges, links, outgoing messages |
| `accentFg` | `--pc-accent-fg` | `#fff` | Text on the brand colour |
| `bg` | `--pc-bg` | `#f2f3f5` | Panels, the chat list, the composer |
| `surface` | `--pc-surface` | `#e3e5e8` | Fields, hover, settings cards |
| `chat` | `--pc-chat` | `#fff` | The backdrop behind messages |
| `fg` | `--pc-fg` | `#2e3035` | Text |
| `muted` | `--pc-muted` | `#5c5e66` | Secondary text and icons |
| `border` | `--pc-border` | `#dcdee3` | Lines |
| `bubble` | `--pc-bubble` | `#f2f3f5` | Incoming message background |
| `bubbleFg` | `--pc-bubble-fg` | text colour | Incoming message text |
| `bubbleOut` | `--pc-bubble-out` | the accent | Outgoing message background: a single colour (`#0b6b4f`) for a flat look, or any CSS gradient |
| `bubbleOutFg` | `--pc-bubble-out-fg` | `accentFg` | Outgoing message text |
| `danger` | `--pc-danger` | `#da373c` | Destructive actions, errors, unread counts |
| `rail` | `--pc-rail` | `#e3e5e8` | The navigation rail |
| `field` | `--pc-field` | `#ebedef` | The box you type in |
| `link` | `--pc-link` | `#006ce7` | Links and @mentions in the flat layout |
| `online` | `--pc-online` | `#23a55a` | The online dot |
| `radius` | `--pc-radius` | `12px` | Corners of the whole frame |
| `bubbleRadius` | `--pc-bubble-radius` | `16px` | Message corners |
| `avatarRadius` | `--pc-avatar-radius` | `50%` | Picture shape: `50%` circle, `30%` rounded, `6px` square |
| `controlRadius` | `--pc-control-radius` | `8px` | Buttons and fields |
| `borderWidth` | `--pc-border-width` | `1px` | Line thickness (`0` removes lines) |
| `font` | `--pc-font` | the system font | Typeface (load web fonts in your own page) |
| `fontSize` | `--pc-font-size` | `15px` | Base text size |
| `sidebarWidth` | `--pc-sidebar-width` | `340px` | Width of the chat list on wide layouts |
| `height` | `--pc-height` | `640px` | Height of the element (or just set `height` in your CSS) |
| `pattern` | `--pc-pattern` | `none` | A backdrop pattern behind the messages: any CSS background image |

**Dark look.** `ui.dark` (or `plug-chat[theme="dark"] { ... }` in your CSS)
holds the colours that differ in the dark. Brand colour, shapes, type and sizes
set in `theme` carry over to dark automatically; the surface colours (`bg`,
`surface`, `chat`, `fg`, `muted`, `border`, `bubble`) do not, so a light
background never leaks into the dark look.

## Layout and density

| Attribute / `ui` key | Values | Effect |
|---|---|---|
| `layout` | `flat` (default) | No bubbles: everyone on one side, with a picture, name and time on the first line of each block and a line between days |
| | `bubbles` | Messages in bubbles, yours on one side, time and status under each block |
| `density` | `comfortable` (default), `compact` | Tighter rows and headers |
| `nav` (attribute) | `off` | Leave out the navigation rail (a tab bar on phones); its controls move into the chat list's header |

The layout follows the space the element is given, not the device: two panes
from 700px wide (info screens slide in beside the conversation), one pane below
that (info screens fill the display, with the device's back button).

## Restyling single elements: `::part()`

Every major element carries a part name your page's CSS can target directly:

```css
plug-chat::part(bubble-out) { border: 2px solid gold; }
plug-chat::part(conversation) { border-radius: 0; }
plug-chat::part(send-button) { border-radius: 8px; }
plug-chat::part(heading) { font-family: "Playfair Display", serif; }
```

| Area | Parts |
|---|---|
| Frame | `root`, `sidebar`, `thread`, `dialog`, `toast` |
| Chat list | `header`, `heading`, `search`, `filters`, `filter`, `stories`, `story`, `conversation-list`, `conversation`, `badge`, `avatar`, `new-chat-button` |
| Conversation | `messages`, `message`, `bubble`, `bubble-in`, `bubble-out`, `sender-name`, `message-meta`, `quote`, `reactions`, `reaction`, `message-toolbar`, `seen-by`, `day-label`, `system-message`, `pinned-bar`, `typing` |
| Content | `file`, `voice-note`, `poll`, `link-preview`, `call` |
| Composer | `composer`, `input-box`, `input`, `send-button`, `attach-menu`, `menu`, `popup` |
| Everywhere | `button`, `icon-button`, `profile`, `settings-group` |

## Your own CSS

For anything parts and tokens do not reach, add CSS that applies inside the
chat. Class names are in [`client/styles.js`](../client/styles.js).

- Server: `ui.css` (the only option for iframes and WebViews, which a page cannot style from outside)
- Page: `<plug-chat stylesheet="/my-chat.css">`, or `chat.css = '.bubble { box-shadow: none }'`

## Wording, language and icons

```js
chat.strings = { 'Chats': 'Inbox', 'Message': 'Write to your classmates…' };
```

Keys are the English text exactly as it appears. `lang` picks a shipped
translation (`en`, `fr`, `es`, `pt`, `ar`); `strings` overrides or completes
it, and is how you add a language that is not shipped. On the server:
`ui.strings`, `ui.heading`.

Icons are replaced by name with your own `<svg>` markup (anything that is not
an `<svg>` is ignored). On the server:

```json
{ "ui": { "icons": { "send": "<svg viewBox=\"0 0 24 24\"><path d=\"M3 12l18-9-6 18-3-8z\"/></svg>" } } }
```

or on a page, before the element connects: `chat.ui = { icons: { send: '<svg …>' } }`.

Names: `plus back next send clip lock info reply forward edit trash smile check
seen checks chevron more play pause download image bubbles camera clock archive
sun moon copy star gear timer close pin flag phone video mic stop poll map eye
mute file`. Icons are drawn with `stroke: currentColor`, 24×24.

`ui.reactions` sets the emoji offered first when reacting.

## Adding your own things

**Attach-menu entries** — what the + button offers next to "Photo or file":

```js
chat.actions = [{
  label: 'Share dues receipt', icon: 'file', color: '#0b6b4f',
  run: ({ conversation, chat }) => chat.sendCustom(conversation.id, { type: 'dues', data: { amount: 50 }, text: 'Paid GHS 50 dues' }),
}];
```

**Your own message types** — how a `custom` message is drawn:

```js
chat.renderers = { dues: (message) => Object.assign(document.createElement('strong'), { textContent: `Dues paid: ${message.custom.data.amount}` }) };
```

**Entries in a message's menu**:

```js
chat.messageActions = [{
  label: 'Create a ticket', icon: 'flag',
  when: ({ message }) => message.kind === 'text',
  run: ({ message }) => fetch('/api/tickets', { method: 'POST', body: JSON.stringify({ text: message.text }) }),
}];
```

**Buttons in the conversation header**:

```js
chat.headerActions = [{ label: 'Open order', icon: 'file', run: ({ conversation }) => (location.href = `/orders?chat=${conversation.id}`) }];
```

**Your own content inside the chat** — slots:

```html
<plug-chat server="/plugchat" token-url="/api/chat-token">
  <div slot="sidebar-top">Reunion is on 12 December. <a href="/reunion">Details</a></div>
  <div slot="sidebar-bottom">Need help? <a href="/support">Contact the office</a></div>
  <div slot="thread-top">Be kind. Messages here follow the association's code of conduct.</div>
  <div slot="empty"><img src="/logo.svg" alt=""> Pick a classmate to start.</div>
</plug-chat>
```

| Slot | Where it appears |
|---|---|
| `sidebar-top` | Above the chat list, under the search box |
| `sidebar-bottom` | Below the chat list |
| `thread-top` | Under the header of the open conversation |
| `empty` | In place of "Select a conversation to start chatting." |

## Events on the element

`plugchat:ready`, `plugchat:unread` (`detail.count`, for your own badge),
`plugchat:message`, `plugchat:theme` (so your page can follow the light/dark
switch), `plugchat:call`, `plugchat:call-join` (cancelable: run the call in your
vendor's SDK) and `plugchat:invite` (turn an invite code into your own link).

## When none of this is enough

Build your own interface on the headless client (`client/plugchat.js`): it
handles sign-in, realtime, encryption, uploads and calls, and you draw
everything. Or call the REST and WebSocket API from any language
([API.md](API.md)).

## What cannot be changed from outside

- The structure of the built-in interface (which element is inside which). Use
  the headless client for a different structure.
- Pages inside an iframe or WebView cannot be styled by the embedding page;
  put the look in the server's `ui` settings instead.
- Security rules: membership checks, token verification, upload handling.
