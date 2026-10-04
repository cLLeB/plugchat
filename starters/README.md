# Starters: the backend half of the integration

Your backend adds two small things to work with PlugChat. Each folder here is
both, complete and runnable, in one file with no packages to install (Ruby
needs the `webrick` gem; C# needs the .NET SDK).

| Folder | Language | Drops into | Run |
|---|---|---|---|
| [`node/`](node/server.mjs) | Node.js | Express, Fastify, Next.js, NestJS | `node server.mjs` |
| [`python/`](python/app.py) | Python | Django, Flask, FastAPI | `python app.py` |
| [`php/`](php/index.php) | PHP | Laravel, Symfony, WordPress | `php -S 127.0.0.1:8080 index.php` |
| [`go/`](go/main.go) | Go | net/http, Gin, Echo, Fiber | `go run main.go` |
| [`ruby/`](ruby/app.rb) | Ruby | Rails, Sinatra | `ruby app.rb` |
| [`java/`](java/Server.java) | Java 17+ | Spring Boot, Jakarta EE, Quarkus | `java Server.java` |
| [`csharp/`](csharp/Program.cs) | C# / .NET 8 | ASP.NET Core | `dotnet run` |

Set `PLUGCHAT_SECRET` to the same value PlugChat was started with (and `PORT`
if 8080 is taken).

## What each one contains

1. **`GET /api/chat-token`** answers `{"token": "…"}`: a short-lived token that
   tells PlugChat who is signed in. The function that builds it is about ten
   lines of standard-library code (an HS256 JWT).
2. **`POST /webhooks/plugchat`** receives events such as `message.new`, after
   checking the `x-plugchat-signature` header so nobody else can post to it.
   This is where you send your own push notifications or emails.

## Putting it in your own app

Copy the two functions (`chat_token` and `signed_by_plugchat`, in each
language's naming style) into a controller, and replace `current_user` with
the person signed in to **your** site: the session, the auth middleware,
whatever you already have. Never take the user id from the request's query
string or body, or anyone could sign in as anyone.

Optional claims you can add to the token: `avatar` (an `https://` image URL),
`email`, `phone`, `username` (ways others can find this person), `handles`
(custom identifiers such as `{"member_no": "AA-0042"}`).

## Checking a starter, or your own endpoint

```bash
node starters/verify.mjs
```

starts every starter whose language is installed on the machine and checks,
against a real PlugChat, that the token is accepted as the right person, that
a genuine webhook is accepted, and that forged and unsigned ones are refused.
Name starters to require them: `node starters/verify.mjs python go`.

Verified on the development machine so far: **Node.js**. The others are
written to the same contract and to each language's standard library, and are
checked by the same script wherever the language is installed.

## Mobile apps

[`mobile/`](mobile) holds a ready component for each platform that shows the
chat in a WebView and hands it tokens from native code, so a mobile team has
nothing to work out:

| File | Platform |
|---|---|
| [`mobile/react-native/PlugChatScreen.tsx`](mobile/react-native/PlugChatScreen.tsx) | React Native (`react-native-webview`) |
| [`mobile/flutter/plugchat_screen.dart`](mobile/flutter/plugchat_screen.dart) | Flutter (`webview_flutter`) |
| [`mobile/android/PlugChatView.kt`](mobile/android/PlugChatView.kt) | Android (Kotlin, `android.webkit.WebView`) |
| [`mobile/ios/PlugChatView.swift`](mobile/ios/PlugChatView.swift) | iOS (Swift, `WKWebView`) |

Each takes the address of your PlugChat, a function that fetches a token from
your backend, and a callback for the unread count. They are written to each
platform's documented WebView API and have **not been run on a device here**:
there is no mobile toolchain on the development machine.