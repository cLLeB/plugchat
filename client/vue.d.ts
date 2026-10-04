// Type definitions for plugchat/vue.
import type { DefineComponent } from 'vue';
import type { Message, FeatureName, UiConfig } from './plugchat.js';
import type { PlugChatAction, PlugChatMessageAction } from './element.js';

export interface PlugChatProps {
  getToken?: () => Promise<string>;
  ui?: UiConfig;
  features?: Partial<Record<FeatureName, boolean>>;
  strings?: Record<string, string>;
  css?: string;
  actions?: PlugChatAction[];
  messageActions?: PlugChatMessageAction[];
  headerActions?: PlugChatAction[];
  renderers?: Record<string, (message: Message) => Node | string>;
}

/** Attributes (server, token-url, layout, heading ...) pass straight through. Emits: ready, unread, message, theme, call, callJoin, invite. */
export const PlugChat: DefineComponent<PlugChatProps>;
export const PlugChatLauncher: DefineComponent<PlugChatProps>;
