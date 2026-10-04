// PlugChat for React (and Next.js, Remix, Gatsby): the chat as a component.
//
//   import { PlugChat } from 'plugchat/react';
//   <PlugChat server="/plugchat" tokenUrl="/api/chat-token" onUnread={(n) => setBadge(n)} style={{ height: 640 }} />
//
// It renders on the server as an empty tag and comes alive in the browser, so
// it needs no "use client" tricks beyond the directive itself and no dynamic
// import in your own code. No JSX is used here, so no build step is needed.
'use client';
import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Props set on the element as properties (objects and functions cannot be attributes).
const PROPERTIES = ['getToken', 'ui', 'features', 'strings', 'css', 'actions', 'messageActions', 'headerActions', 'renderers'];
// Props that listen: onUnread={(count, event) => ...}. Each handler receives event.detail, then the event.
const EVENTS = { onReady: 'plugchat:ready', onUnread: 'plugchat:unread', onMessage: 'plugchat:message', onTheme: 'plugchat:theme', onCall: 'plugchat:call', onCallJoin: 'plugchat:call-join', onInvite: 'plugchat:invite' };
// Props that become attributes under another name.
const ATTRIBUTES = { tokenUrl: 'token-url', peerHandle: 'peer-handle', notificationIcon: 'notification-icon', className: 'class' };

function make(tag, load) {
  return forwardRef(function PlugChatComponent(props, ref) {
    const element = useRef(null);
    useImperativeHandle(ref, () => element.current, []);
    const attributes = {};
    for (const [name, value] of Object.entries(props)) {
      if (PROPERTIES.includes(name) || name in EVENTS || name === 'children' || value == null || value === false) continue;
      attributes[ATTRIBUTES[name] ?? name] = value === true ? '' : value;
    }
    // The element's code only loads in the browser.
    useEffect(() => void load(), []);
    // Properties: applied whenever they change. The element keeps values set before it is defined.
    useEffect(() => {
      for (const name of PROPERTIES) if (props[name] !== undefined) element.current[name] = props[name];
    });
    const handlers = useRef({});
    handlers.current = props;
    useEffect(() => {
      const node = element.current;
      const listeners = Object.entries(EVENTS).map(([prop, type]) => {
        const listener = (event) => handlers.current[prop]?.(event.detail, event);
        node.addEventListener(type, listener);
        return [type, listener];
      });
      return () => listeners.forEach(([type, listener]) => node.removeEventListener(type, listener));
    }, []);
    return createElement(tag, { ...attributes, ref: element, suppressHydrationWarning: true }, props.children);
  });
}

/** The chat. Props: every <plug-chat> attribute in camelCase, plus getToken, ui, features, strings, css, actions, messageActions, headerActions, renderers and onReady / onUnread / onMessage / onTheme / onCall / onCallJoin / onInvite. Children with a `slot` attribute fill the chat's slots. */
export const PlugChat = make('plug-chat', () => import('./element.js'));
/** The floating button with an unread badge. Same props, plus position="left" and label. */
export const PlugChatLauncher = make('plug-chat-launcher', () => import('./launcher.js'));
