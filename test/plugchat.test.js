import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlugChat, signToken, signWebhook } from '../server/index.js';
import { PlugChat } from '../client/plugchat.js';

const SECRET = 'test-secret-test-secret-test-secret-0123456789';
let chat, server, url, dir;
const clients = [];

const client = async (sub, name = sub) => {
  const c = new PlugChat({ url, getToken: async () => signToken({ sub, name }, SECRET) });
  await c.connect();
  clients.push(c);
  return c;
};

const next = (c, type, pred = () => true) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), 3000);
    const off = c.on(type, (e) => {
      if (!pred(e)) return;
      clearTimeout(timer);
      off();
      resolve(e);
    });
  });

const api = (path, { token, method = 'GET', json } = {}) =>
  fetch(`${url}/v1${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(json ? { 'content-type': 'application/json' } : {}) },
    body: json ? JSON.stringify(json) : undefined,
  });

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'plugchat-'));
  chat = createPlugChat({ secret: SECRET, dataDir: dir, log: { error() {} } });
  server = await chat.listen(0);
  url = `http://localhost:${server.address().port}/plugchat`;
});

after(() => {
  for (const c of clients) c.close();
  server.close();
  server.closeAllConnections();
  chat.close();
  rmSync(dir, { recursive: true, force: true });
});

test('rejects missing, forged, unsigned and expired tokens', async () => {
  assert.equal((await api('/me')).status, 401);
  assert.equal((await api('/me', { token: signToken({ sub: 'x' }, 'another-secret-another-secret-another') })).status, 401);
  assert.equal((await api('/me', { token: signToken({ sub: 'x' }, SECRET, -10) })).status, 401);

  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const none = `${b64u({ alg: 'none' })}.${b64u({ sub: 'x', exp: Date.now() / 1000 + 60 })}.`;
  assert.equal((await api('/me', { token: none })).status, 401);
});

test('direct messages arrive in realtime and are private to members', async () => {
  const alice = await client('alice', 'Alice');
  const bob = await client('bob', 'Bob');
  const eve = await client('eve', 'Eve');

  const dm = await alice.openDm('bob');
  assert.equal((await bob.openDm('alice')).id, dm.id, 'a dm is unique per pair');

  const incoming = next(bob, 'message');
  const sent = await alice.send(dm.id, { text: 'hello bob' });
  assert.equal((await incoming).text, 'hello bob');
  assert.equal((await bob.conversations())[0].unread, 1);

  await assert.rejects(eve.messages(dm.id), { status: 404 });
  await assert.rejects(eve.send(dm.id, { text: 'hi' }), { status: 404 });
  await assert.rejects(eve.react(sent.id, '👍'), { status: 404 });
  await assert.rejects(eve.remove(sent.id), { status: 404 });
  assert.equal((await eve.conversations()).length, 0);
});

test('edit, delete, reactions, replies and read receipts', async () => {
  const alice = await client('alice');
  const bob = await client('bob');
  const dm = await alice.openDm('bob');

  const first = await alice.send(dm.id, { text: 'frist' });
  await assert.rejects(bob.edit(first, 'hacked'), { status: 403 });
  await assert.rejects(bob.remove(first.id), { status: 403 });

  const updated = next(bob, 'message.updated');
  await alice.edit(first, 'first');
  assert.equal((await updated).text, 'first');

  const reacted = next(alice, 'reaction');
  await bob.react(first.id, '❤️');
  assert.deepEqual((await reacted).reactions, { '❤️': ['bob'] });

  const reply = await bob.send(dm.id, { text: 'reply', replyTo: first.id });
  assert.equal(reply.replyTo, first.id);

  const last = await alice.send(dm.id, { text: 'seen this?' });
  const read = next(alice, 'read', (e) => e.userId === 'bob');
  await bob.read(dm.id, last.seq);
  assert.equal((await read).seq, last.seq);
  assert.equal((await bob.conversation(dm.id)).unread, 0);

  await alice.remove(first.id);
  const history = await bob.messages(dm.id);
  const tombstone = history.find((m) => m.id === first.id);
  assert.equal(tombstone.deleted, true);
  assert.equal(tombstone.body, '');
});

test('group roles: only admins manage members, anyone can leave', async () => {
  const alice = await client('alice');
  const bob = await client('bob');
  await client('carol');
  await client('dave');

  const group = await alice.createGroup({ title: 'Committee', memberIds: ['bob', 'carol'] });
  assert.equal(group.members.find((m) => m.userId === 'alice').role, 'owner');

  await assert.rejects(bob.addMembers(group.id, ['dave']), { status: 403 });
  await assert.rejects(bob.removeMember(group.id, 'carol'), { status: 403 });
  await assert.rejects(bob.update(group.id, { title: 'Mine now' }), { status: 403 });

  const added = await alice.addMembers(group.id, ['dave']);
  assert.equal(added.members.length, 4);

  const removed = next(bob, 'conversation.removed');
  await bob.leave(group.id);
  await removed;
  await assert.rejects(bob.messages(group.id), { status: 404 });
  await assert.rejects(alice.createGroup({ title: 'x', memberIds: ['nobody-here'] }), { code: 'user_not_found' });
});

test('end-to-end encryption: the server only ever stores ciphertext', async () => {
  const alice = await client('alice');
  const bob = await client('bob');
  const carol = await client('carol');

  const group = await alice.createGroup({ title: 'Secret', memberIds: ['bob'], encrypted: true });
  const incoming = next(bob, 'message', (m) => m.conversationId === group.id);
  await alice.send(group.id, { text: 'the eagle lands at noon' });
  const got = await incoming;
  assert.equal(got.text, 'the eagle lands at noon');
  assert.equal(got.encrypted, true);

  const stored = chat.store.all('SELECT body FROM messages WHERE conversation_id = ?', group.id);
  assert.equal(stored.length, 1);
  assert.ok(stored[0].body.startsWith('e1.'));
  assert.ok(!stored[0].body.includes('eagle'));

  // plaintext is refused outright
  const res = await api(`/conversations/${group.id}/messages`, {
    token: signToken({ sub: 'alice' }, SECRET), method: 'POST', json: { body: 'oops plaintext' },
  });
  assert.equal(res.status, 400);

  // a member added later is handed the key by the person adding them
  await alice.addMembers(group.id, ['carol']);
  assert.equal((await carol.messages(group.id))[0].text, 'the eagle lands at noon');
  assert.equal(await alice.safetyCode(group.id), await carol.safetyCode(group.id));

  // encrypted attachment round-trip
  const file = new File([new Uint8Array([1, 2, 3, 4, 5])], 'plan.bin', { type: 'application/x-plan' });
  const withFile = await alice.send(group.id, { text: 'see attached', file });
  const mine = (await bob.messages(group.id)).find((m) => m.id === withFile.id);
  assert.equal(mine.file.name, 'plan.bin');
  assert.deepEqual(new Uint8Array(await (await bob.download(mine)).arrayBuffer()), new Uint8Array([1, 2, 3, 4, 5]));
  const row = chat.store.getFile(mine.file.fileId);
  assert.equal(row.name, 'encrypted', 'the real file name is not visible to the server');
});

test('files are only downloadable by conversation members', async () => {
  const alice = await client('alice');
  const bob = await client('bob');
  const eve = await client('eve');
  const dm = await alice.openDm('bob');

  const file = new File(['<script>alert(1)</script>'], 'x.html', { type: 'text/html' });
  const msg = await alice.send(dm.id, { file });
  assert.equal(await (await bob.download(msg)).text(), '<script>alert(1)</script>');

  const res = await api(`/files/${msg.file.fileId}`, { token: signToken({ sub: 'bob' }, SECRET) });
  assert.equal(res.headers.get('content-type'), 'application/octet-stream', 'uploads are never served as html');
  assert.equal((await api(`/files/${msg.file.fileId}`, { token: signToken({ sub: 'eve' }, SECRET) })).status, 404);
  await assert.rejects(eve.download(msg), { status: 404 });
});

test('disappearing messages are erased from the database', async () => {
  const alice = await client('alice');
  await client('frank');
  const dm = await alice.openDm('frank', { ttlSeconds: 5 });
  const msg = await alice.send(dm.id, { text: 'gone soon' });
  assert.ok(msg.expiresAt > Date.now());

  chat.store.run('UPDATE messages SET expires_at = 1 WHERE id = ?', msg.id);
  assert.equal((await alice.messages(dm.id)).length, 0, 'expired messages are hidden immediately');
  assert.equal(chat.store.sweepExpired().length, 1);
  assert.equal(chat.store.all('SELECT 1 FROM messages WHERE id = ?', msg.id).length, 0);
});

test('blocking stops direct messages', async () => {
  const alice = await client('alice');
  const mallory = await client('mallory');
  const dm = await mallory.openDm('alice');
  await alice.block('mallory');
  await assert.rejects(mallory.send(dm.id, { text: 'hey' }), { status: 403 });
  await alice.unblock('mallory');
  await mallory.send(dm.id, { text: 'hey' });
});

test('host admin token can provision users, post system messages and erase a user', async () => {
  const admin = signToken({ sub: 'host', admin: true }, SECRET);
  assert.equal((await api('/users/u-900', { token: signToken({ sub: 'alice' }, SECRET), method: 'PUT', json: { name: 'Nope' } })).status, 403);

  assert.equal((await api('/users/u-900', { token: admin, method: 'PUT', json: { name: 'Grace' } })).status, 200);
  assert.equal((await api('/users/u-901', { token: admin, method: 'PUT', json: { name: 'Heidi' } })).status, 200);
  const created = await api('/conversations', { token: admin, method: 'POST', json: { type: 'group', title: 'Welcome', memberIds: ['u-900', 'u-901'] } });
  assert.equal(created.status, 201);
  const group = await created.json();

  const posted = await api(`/conversations/${group.id}/messages`, { token: admin, method: 'POST', json: { body: 'Welcome aboard' } });
  assert.equal((await posted.json()).kind, 'system');

  const grace = await client('u-900');
  assert.equal((await grace.messages(group.id))[0].text, 'Welcome aboard');

  assert.equal((await api('/users/u-900', { token: admin, method: 'DELETE' })).status, 200);
  assert.equal(chat.store.getUser('u-900'), undefined);
});

test('webhook signatures verify with the shared secret', () => {
  const body = JSON.stringify({ type: 'message.new' });
  assert.match(signWebhook(body, SECRET), /^sha256=[0-9a-f]{64}$/);
  assert.notEqual(signWebhook(body, SECRET), signWebhook(body + ' ', SECRET));
});
