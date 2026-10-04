// Compiled (never run) by `npm run check:types` to prove the published types
// describe real usage.
import { createPlugChat, signToken, type Hooks } from '../server/index.js';
import { PlugChat, type Message } from '../client/plugchat.js';
import '../client/element.js';

const hooks: Hooks = {
  'message.before': ({ message }) => (message.kind === 'text' && message.body.includes('spam') ? { allow: false, reason: 'No spam' } : undefined),
  'call.join': async ({ call, userId }) => ({ url: `https://calls.example/${call.id}`, data: { token: userId } }),
};

const server = createPlugChat({ secret: 'x'.repeat(32), hooks, cluster: true, userStorageBytes: 1024 });
const token: string = signToken({ sub: 'u1', name: 'Ama', handles: { member_no: '42' } }, 'x'.repeat(32), 600);

export async function hostSide() {
  await server.admin.upsertUser('u1', { name: 'Ama', handles: { email: 'ama@example.com' } });
  const group = await server.admin.createGroup({ title: 'Order #1', memberIds: ['u1', 'u2'] });
  await server.admin.post(group.id, 'Shipped');
  const { total } = await server.admin.unread('u1');
  return total + token.length;
}

export async function clientSide() {
  const chat = new PlugChat({ url: '/plugchat', getToken: async () => token });
  const me = await chat.connect();
  const off = chat.on('message', (m: Message) => console.log(m.text, m.poll?.options));
  const dm = await chat.openDmByHandle('ama@example.com', { encrypted: true });
  const sent = await chat.send(dm.id, { text: 'hi', mentions: [me.id] });
  await chat.star(sent.id);
  const around = await chat.messages(dm.id, { around: sent.seq, limit: 20 });
  off();
  return around.length;
}

export function pageSide() {
  const el = document.querySelector('plug-chat')!;
  el.actions = [{ label: 'Send money', run: ({ conversation, chat }) => chat.sendCustom(conversation.id, { type: 'payment', data: { amount: 5 } }).then(() => {}) }];
  el.renderers = { payment: (m) => `Paid ${(m.custom!.data as { amount: number }).amount}` };
  el.addEventListener('plugchat:unread', (e) => console.log(e.detail.count));
  el.addEventListener('plugchat:call-join', (e) => e.preventDefault());
  document.querySelector('plug-chat-launcher')!.open();
}
