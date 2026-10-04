// Type definitions for plugchat/react.
import type { CSSProperties, ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import type { PlugChat as Client, Conversation, Message, FeatureName, UiConfig } from './plugchat.js';
import type { PlugChatElement, PlugChatLauncher as LauncherElement, PlugChatAction, PlugChatMessageAction } from './element.js';

export interface PlugChatProps {
  /** Where PlugChat is mounted, e.g. "/plugchat". */
  server: string;
  /** Your endpoint returning {"token": "..."}; or pass getToken. */
  tokenUrl?: string;
  getToken?: () => Promise<string>;
  token?: string;
  peer?: string;
  peerHandle?: string;
  invite?: string;
  heading?: string;
  theme?: 'light' | 'dark';
  lang?: string;
  dir?: 'ltr' | 'rtl';
  layout?: 'flat' | 'bubbles';
  density?: 'comfortable' | 'compact';
  nav?: 'off';
  stylesheet?: string;
  notificationIcon?: string;
  e2ee?: 'off';
  calls?: 'off';
  stories?: 'off';
  history?: 'off';
  ui?: UiConfig;
  features?: Partial<Record<FeatureName, boolean>>;
  strings?: Record<string, string>;
  css?: string;
  actions?: PlugChatAction[];
  messageActions?: PlugChatMessageAction[];
  headerActions?: PlugChatAction[];
  renderers?: Record<string, (message: Message) => Node | string>;
  onReady?(detail: { user: NonNullable<Client['me']> }, event: CustomEvent): void;
  onUnread?(detail: { count: number }, event: CustomEvent): void;
  onMessage?(detail: { message: Message }, event: CustomEvent): void;
  onTheme?(detail: { theme: 'light' | 'dark'; choice: 'light' | 'dark' | 'system' }, event: CustomEvent): void;
  onCall?(detail: { message: Message }, event: CustomEvent): void;
  /** Call event.preventDefault() to run the call in your own vendor SDK. */
  onCallJoin?(detail: { callId: string; conversation: Conversation; url?: string; data?: unknown }, event: CustomEvent): void;
  /** Set detail.text to the link your site wants shown for detail.code. */
  onInvite?(detail: { code: string; conversation: Conversation; text: string }, event: CustomEvent): void;
  className?: string;
  style?: CSSProperties;
  id?: string;
  /** Elements with a `slot` attribute: sidebar-top, sidebar-bottom, thread-top, empty. */
  children?: ReactNode;
}

export const PlugChat: ForwardRefExoticComponent<PlugChatProps & RefAttributes<PlugChatElement>>;
export const PlugChatLauncher: ForwardRefExoticComponent<PlugChatProps & { position?: 'left'; label?: string } & RefAttributes<LauncherElement>>;
