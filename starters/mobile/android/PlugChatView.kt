// PlugChat in a native Android app: the chat page in a WebView, signed in with
// tokens your app fetches from your own backend.
//
//   val chat = PlugChatView(context, "https://your-site.example/plugchat", getToken = { api.chatToken() }, onUnread = { badge.number = it })
//   layout.addView(chat)
//
// Written to the documented android.webkit API; not run on a device here.
package example.plugchat

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

@SuppressLint("SetJavaScriptEnabled", "ViewConstructor")
class PlugChatView(
    context: Context,
    /** Where PlugChat is mounted, e.g. https://your-site.example/plugchat */
    chatUrl: String,
    /** Ask YOUR backend for a chat token for the signed-in user. */
    private val getToken: suspend () -> String,
    /** Unread count, for a badge. */
    private val onUnread: (Int) -> Unit = {},
    /** Query options for the page: "peer=42&layout=flat" ... */
    options: String = "",
) : WebView(context) {
    private val scope = CoroutineScope(Dispatchers.Main)

    init {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true // drafts, theme choice and encryption keys live here
        settings.mediaPlaybackRequiresUserGesture = false
        webViewClient = WebViewClient()
        webChromeClient = object : WebChromeClient() {
            // Voice notes and built-in calls: grant what the page asks for, once your app holds the
            // RECORD_AUDIO and CAMERA runtime permissions.
            override fun onPermissionRequest(request: PermissionRequest) = request.grant(request.resources)
        }
        // The page posts to an interface with exactly this name.
        addJavascriptInterface(Bridge(), "PlugChatNative")
        loadUrl("$chatUrl/embed" + if (options.isEmpty()) "" else "?$options")
    }

    private inner class Bridge {
        @JavascriptInterface
        fun postMessage(text: String) {
            val message = runCatching { JSONObject(text) }.getOrNull() ?: return
            when (message.optString("type")) {
                "plugchat:token-request" -> scope.launch {
                    val token = getToken()
                    // JSONObject.quote makes the token a safe JavaScript string literal.
                    evaluateJavascript("window.plugchatSetToken(${JSONObject.quote(token)})", null)
                }
                "plugchat:unread" -> post { onUnread(message.optInt("count")) }
            }
        }
    }
}
