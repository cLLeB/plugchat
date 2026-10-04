// PlugChat for Vue 3 (and Nuxt): the chat as a component.
//
//   import { PlugChat } from 'plugchat/vue';
//   <PlugChat server="/plugchat" token-url="/api/chat-token" :ui="{ layout: 'flat' }" @unread="(count) => (badge = count)" style="height: 640px" />
//
// It renders on the server as an empty tag and comes alive in the browser.
// No compiler option is needed: the tag is created directly, not through a template.
import { defineComponent, h, onMounted, ref, watchEffect } from 'vue';

const PROPERTIES = ['getToken', 'ui', 'features', 'strings', 'css', 'actions', 'messageActions', 'headerActions', 'renderers'];
// Emitted with event.detail first, then the event: @unread="(detail, event) => ..."
const EVENTS = { ready: 'plugchat:ready', unread: 'plugchat:unread', message: 'plugchat:message', theme: 'plugchat:theme', call: 'plugchat:call', callJoin: 'plugchat:call-join', invite: 'plugchat:invite' };

function make(name, tag, load) {
  return defineComponent({
    name,
    inheritAttrs: false,
    props: Object.fromEntries(PROPERTIES.map((p) => [p, { type: null, default: undefined }])),
    emits: Object.keys(EVENTS),
    setup(props, { attrs, emit, slots, expose }) {
      const element = ref(null);
      expose({ element });
      onMounted(() => {
        load();
        for (const [event, type] of Object.entries(EVENTS)) element.value.addEventListener(type, (e) => emit(event, e.detail, e));
        // Properties: applied whenever they change. The element keeps values set before it is defined.
        watchEffect(() => {
          for (const p of PROPERTIES) if (props[p] !== undefined) element.value[p] = props[p];
        });
      });
      return () => h(tag, { ...attrs, ref: element }, slots.default?.());
    },
  });
}

/** The chat. Attributes pass straight through; getToken, ui, features, strings, css, actions, messageActions, headerActions and renderers are props. */
export const PlugChat = make('PlugChat', 'plug-chat', () => import('./element.js'));
/** The floating button with an unread badge. */
export const PlugChatLauncher = make('PlugChatLauncher', 'plug-chat-launcher', () => import('./launcher.js'));
