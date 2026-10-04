// A Vue app using the chat as a component. Built by build.mjs; a real project would write a template:
//   <PlugChat server="/plugchat" token-url="/api/chat-token" :features="{ stories: false }" @unread="(d) => (unread = d.count)" />
import { createApp, h, ref } from 'vue';
import { PlugChat } from '../../client/vue.js'; // in your project: from 'plugchat/vue'

createApp({
  setup() {
    const unread = ref(0);
    const ready = ref('connecting');
    return () => h('div', { class: 'app' }, [
      h('p', { id: 'status' }, `Vue · ${ready.value} · ${unread.value} unread`),
      h(PlugChat, {
        server: '/plugchat', 'token-url': '/api/chat-token', heading: 'From Vue',
        features: { stories: false },
        onReady: (detail) => (ready.value = `signed in as ${detail.user.name}`),
        onUnread: (detail) => (unread.value = detail.count),
        style: 'height: calc(100vh - 60px)',
      }, () => h('div', { slot: 'sidebar-top', style: 'padding: 8px 14px; font-size: 13px' }, 'This line is a Vue child in a slot.')),
    ]);
  },
}).mount('#root');
