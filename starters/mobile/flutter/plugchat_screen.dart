// PlugChat in a Flutter app: the chat page in a WebView, signed in with tokens
// your app fetches from your own backend.
//
//   flutter pub add webview_flutter
//   PlugChatScreen(chatUrl: 'https://your-site.example/plugchat', getToken: fetchChatToken, onUnread: setBadge)
//
// Written to the documented webview_flutter (4.x) API; not run on a device here.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class PlugChatScreen extends StatefulWidget {
  const PlugChatScreen({super.key, required this.chatUrl, required this.getToken, this.onUnread, this.options = const {}});

  /// Where PlugChat is mounted, e.g. https://your-site.example/plugchat
  final String chatUrl;

  /// Ask YOUR backend for a chat token for the signed-in user.
  final Future<String> Function() getToken;

  /// Unread count, for a tab or app-icon badge.
  final void Function(int count)? onUnread;

  /// Query options for the page: peer, layout, theme, lang ...
  final Map<String, String> options;

  @override
  State<PlugChatScreen> createState() => _PlugChatScreenState();
}

class _PlugChatScreenState extends State<PlugChatScreen> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    final uri = Uri.parse('${widget.chatUrl}/embed').replace(queryParameters: widget.options.isEmpty ? null : widget.options);
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      // The page posts to a channel with exactly this name.
      ..addJavaScriptChannel('PlugChatNative', onMessageReceived: _onMessage)
      ..loadRequest(uri);
  }

  Future<void> _onMessage(JavaScriptMessage message) async {
    final Map<String, dynamic> data;
    try {
      data = jsonDecode(message.message) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    if (data['type'] == 'plugchat:token-request') {
      final token = await widget.getToken();
      // jsonEncode makes the token a safe JavaScript string literal.
      await _controller.runJavaScript('window.plugchatSetToken(${jsonEncode(token)})');
    } else if (data['type'] == 'plugchat:unread') {
      widget.onUnread?.call(data['count'] as int);
    }
  }

  @override
  Widget build(BuildContext context) => WebViewWidget(controller: _controller);
}
