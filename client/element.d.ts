// Type definitions for the <plug-chat> and <plug-chat-launcher> elements.
import type { PlugChat, Conversation, Message, FeatureName, UiConfig } from './plugchat.js';

export interface PlugChatAction {
  /** Text shown in the attach menu or the header. */
  label: string;
  /** One of the built-in icon names; a plus sign otherwise. */
  icon?: string;
  /** Background of the round icon in the attach menu. */
  color?: string;
  run(context: { conversation: Conversation; chat: PlugChat; element: PlugChatElement }): void | Promise<void>;
}

export interface PlugChatMessageAction {
  label: string;
  icon?: string;
  /** Offer this entry only for some messages. */
  when?(context: { message: Message; conversation: Conversation }): boolean;
  run(context: { message: Message; conversation: Conversation; chat: PlugChat; element: PlugChatElement }): void | Promise<void>;
}

export interface PlugChatElementEvents {
  'plugchat:ready': CustomEvent<{ user: NonNullable<PlugChat['me']> }>;
  'plugchat:unread': CustomEvent<{ count: number }>;
  'plugchat:message': CustomEvent<{ message: Message }>;
  /** Cancelable. Call preventDefault() to run the call in your own vendor SDK. */
  'plugchat:call-join': CustomEvent<{ callId: string; conversation: Conversation; url?: string; data?: unknown }>;
  /** Set detail.text to the shareable link your site wants shown for detail.code. */
  'plugchat:invite': CustomEvent<{ code: string; conversation: Conversation; text: string }>;
  /** The light or dark look changed, so the page around the chat can follow. */
  'plugchat:theme': CustomEvent<{ theme: 'light' | 'dark'; choice: 'light' | 'dark' | 'system' }>;
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
  /** Extra entries for a message's menu. */
  messageActions: PlugChatMessageAction[];
  /** Extra buttons in the conversation header. */
  headerActions: PlugChatAction[];
  /** Override or add interface translations, keyed by the English text. */
  strings?: Record<string, string>;
  /** Look and wording for this page; refines what the server's `ui` option says. */
  ui: UiConfig;
  /** Switch features off for this page. What the server switched off stays off. */
  features: Partial<Record<FeatureName, boolean>>;
  /** Extra CSS applied inside the chat. */
  css: string;
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
