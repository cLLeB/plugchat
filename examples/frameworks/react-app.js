// A React app using the chat as a component. Built by build.mjs; a real project would write JSX:
//   <PlugChat server="/plugchat" tokenUrl="/api/chat-token" features={{ stories: false }} onUnread={setUnread} />
import { createElement as e, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PlugChat } from '../../client/react.js'; // in your project: from 'plugchat/react'

function App() {
  const [unread, setUnread] = useState(0);
  const [ready, setReady] = useState('connecting');
  return e('div', { className: 'app' },
    e('p', { id: 'status' }, `React · ${ready} · ${unread} unread`),
    e(PlugChat, {
      server: '/plugchat', tokenUrl: '/api/chat-token', heading: 'From React',
      features: { stories: false },
      headerActions: [{ label: 'Say hi', icon: 'smile', run: ({ conversation, chat }) => chat.send(conversation.id, { text: 'Hi from a React button' }) }],
      onReady: (detail) => setReady(`signed in as ${detail.user.name}`),
      onUnread: (detail) => setUnread(detail.count),
      style: { height: 'calc(100vh - 60px)' },
    }, e('div', { slot: 'sidebar-top', style: { padding: '8px 14px', fontSize: 13 } }, 'This line is a React child in a slot.')));
}

createRoot(document.getElementById('root')).render(e(App));
