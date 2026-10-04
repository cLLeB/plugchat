// PlugChat in a React Native app: the chat page in a WebView, signed in with
// tokens your app fetches from your own backend.
//
//   npm install react-native-webview
//   <PlugChatScreen chatUrl="https://your-site.example/plugchat" getToken={fetchChatToken} onUnread={setBadge} />
//
// Written to the documented react-native-webview API; not run on a device here.
import React, { useCallback, useRef } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

type Props = {
  /** Where PlugChat is mounted, e.g. https://your-site.example/plugchat */
  chatUrl: string;
  /** Ask YOUR backend for a chat token for the signed-in user. */
  getToken: () => Promise<string>;
  /** Unread count, for a tab or app-icon badge. */
  onUnread?: (count: number) => void;
  /** Query options for the page: peer, layout, theme, lang, calls ... */
  options?: Record<string, string>;
  /** With options.calls === 'native': run the call in your call vendor's SDK. */
  onCallJoin?: (call: { callId: string; url?: string; data?: unknown }) => void;
};

export function PlugChatScreen({ chatUrl, getToken, onUnread, options = {}, onCallJoin }: Props) {
  const web = useRef<WebView>(null);
  const query = new URLSearchParams(options).toString();

  const onMessage = useCallback(async (event: WebViewMessageEvent) => {
    let message: any;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === 'plugchat:token-request') {
      const token = await getToken();
      // JSON.stringify makes the token a safe JavaScript string literal.
      web.current?.injectJavaScript(`window.plugchatSetToken(${JSON.stringify(token)}); true;`);
    } else if (message.type === 'plugchat:unread') onUnread?.(message.count);
    else if (message.type === 'plugchat:call-join') onCallJoin?.(message);
  }, [getToken, onUnread, onCallJoin]);

  return (
    <WebView
      ref={web}
      source={{ uri: `${chatUrl}/embed${query ? `?${query}` : ''}` }}
      onMessage={onMessage}
      // Voice notes and built-in calls need the microphone and camera.
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      mediaCapturePermissionGrantType="grant"
      originWhitelist={[new URL(chatUrl).origin]}
    />
  );
}
