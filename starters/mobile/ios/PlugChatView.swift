// PlugChat in a native iOS app: the chat page in a WKWebView, signed in with
// tokens your app fetches from your own backend.
//
//   let chat = PlugChatView(chatURL: URL(string: "https://your-site.example/plugchat")!,
//                           getToken: { try await api.chatToken() },
//                           onUnread: { count in tabBarItem.badgeValue = count > 0 ? "\(count)" : nil })
//   view.addSubview(chat)
//
// Add NSMicrophoneUsageDescription and NSCameraUsageDescription to Info.plist
// for voice notes and built-in calls.
// Written to the documented WebKit API; not run on a device here.
import UIKit
import WebKit

final class PlugChatView: UIView, WKScriptMessageHandler, WKUIDelegate {
    private var webView: WKWebView!
    private let getToken: () async throws -> String
    private let onUnread: (Int) -> Void

    /// - Parameters:
    ///   - chatURL: where PlugChat is mounted, e.g. https://your-site.example/plugchat
    ///   - options: query options for the page: peer, layout, theme, lang ...
    ///   - getToken: ask YOUR backend for a chat token for the signed-in user
    init(chatURL: URL, options: [String: String] = [:], getToken: @escaping () async throws -> String, onUnread: @escaping (Int) -> Void = { _ in }) {
        self.getToken = getToken
        self.onUnread = onUnread
        super.init(frame: .zero)

        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        // The page posts to a handler with exactly this name.
        configuration.userContentController.add(self, name: "PlugChatNative")

        webView = WKWebView(frame: bounds, configuration: configuration)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.uiDelegate = self
        addSubview(webView)

        var components = URLComponents(url: chatURL.appendingPathComponent("embed"), resolvingAgainstBaseURL: false)!
        if !options.isEmpty { components.queryItems = options.map { URLQueryItem(name: $0.key, value: $0.value) } }
        webView.load(URLRequest(url: components.url!))
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String,
              let data = text.data(using: .utf8),
              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = payload["type"] as? String else { return }
        switch type {
        case "plugchat:token-request":
            Task { @MainActor in
                guard let token = try? await getToken(),
                      // JSON-encoding makes the token a safe JavaScript string literal.
                      let literal = String(data: try JSONSerialization.data(withJSONObject: [token]), encoding: .utf8) else { return }
                _ = try? await webView.evaluateJavaScript("window.plugchatSetToken(\(literal)[0])")
            }
        case "plugchat:unread":
            onUnread(payload["count"] as? Int ?? 0)
        default:
            break
        }
    }

    // Microphone and camera prompts from the page (iOS 15+).
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }
}
