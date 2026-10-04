// Type definitions for the <plug-chat> and <plug-chat-launcher> elements.
import type { PlugChat, Conversation, Message } from './plugchat.js';

export interface PlugChatAction {
  /** Text shown in the attach menu. */
  label: string;
  run(context: { conversation: Conversation; chat: PlugChat; element: PlugChatElement }): void | Promise<void>;
}

export interface PlugChatElementEvents {
  'plugchat:ready': CustomEvent<{ user: NonNullable<PlugChat['me']> }>;
  'plugchat:unread': CustomEvent<{ count: number }>;
  'plugchat:message': CustomEvent<{ message: Message }>;
  /** Cancelable. Call preventDefault() to run the call in your own vendor SDK. */
  'plugchat:call-join': CustomEvent<{ callId: string; conversation: Conversation; url?: string; data?: unknown }>;
  /** Set detail.text to the shareable link your site wants shown for detail.code. */
  'plugchat:invite': CustomEvent<{ code: string; conversation: Conversation; text: string }>;
}

export class PlugChatElement extends HTMLElement {
  /** The underlying client, once connected. */
  chat: PlugChat | null;
  /** Alternative to the token / token-url attributes. */
  getToken: (() => Promise<string>) | null;
  /** How the host's own message types are drawn: { [type]: (message) => Node | string }. */
  renderers: Record<string, (message: Message) => Node | string>;
  /** Extra entries for the attach menu. */
  actions: PlugChatAction[];
  /** Override or add interface translations, keyed by the English text. */
  strings?: Record<string, string>;
  addEventListener<K extends keyof PlugChatElementEvents>(type: K, listener: (event: PlugChatElementEvents[K]) => void, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
}

export class PlugChatLauncher extends HTMLElement {
  getToken: (() => Promise<string>) | null;
  renderers: Record<string, (message: Message) => Node | string>;
  actions: PlugChatAction[];
  readonly chatElement: PlugChatElement;
  open(): void;
  close(): void;
  toggle(): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'plug-chat': PlugChatElement;
    'plug-chat-launcher': PlugChatLauncher;
  }
}
