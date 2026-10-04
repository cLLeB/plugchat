import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  chat = createPlugChat({ secret: SECRET, dataDir: dir, log: { error() {} }, rateLimit: { perSecond: 1000, burst: 1000 } });
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

test('encryption: a second device gets the keys; the key is replaced when someone leaves', async () => {
  const ann = await client('md-ann');
  const ben = await client('md-ben');
  const cat = await client('md-cat');
  const group = await ann.createGroup({ title: 'Board', memberIds: ['md-ben', 'md-cat'], encrypted: true });
  await ann.send(group.id, { text: 'before the phone' });

  // Ben signs in on a second device. It has no keys until a device that does hands them over.
  const shared = next(ann, 'conversation', (c) => c.id === group.id && c.members.find((m) => m.userId === 'md-ben').devices.length === 2);
  const benPhone = await client('md-ben');
  assert.notEqual(benPhone.identity.deviceId, ben.identity.deviceId);
  await shared;
  await next(benPhone, 'conversation', (c) => c.id === group.id && !!c.wrappedKeys[benPhone.identity.deviceId]?.[1]);
  assert.equal((await benPhone.messages(group.id))[0].text, 'before the phone', 'history is readable on the new device');
  assert.equal(await ann.safetyCode(group.id), await benPhone.safetyCode(group.id));

  // Cat is removed. She still knows key 1, so the next message must use a new key she never gets.
  await ann.removeMember(group.id, 'md-cat');
  assert.equal((await ann.conversation(group.id)).rotatePending, true);
  const stale = chat.store.get('SELECT body FROM messages WHERE conversation_id = ?', group.id).body;
  const replay = await api(`/conversations/${group.id}/messages`, { token: signToken({ sub: 'md-ann' }, SECRET), method: 'POST', json: { body: stale } });
  assert.equal(replay.status, 409, 'the old key is refused once someone has left');

  const got = next(benPhone, 'message', (m) => m.conversationId === group.id);
  const after = await ann.send(group.id, { text: 'after cat left' });
  assert.match(after.body, /^e1\.2\./, 'sent under the new key');
  assert.equal((await got).text, 'after cat left');
  assert.equal((await ben.messages(group.id)).at(-1).text, 'after cat left');
  assert.equal(chat.store.all('SELECT 1 FROM member_keys WHERE conversation_id = ? AND user_id = ?', group.id, 'md-cat').length, 0);
  assert.equal(chat.store.get('SELECT key_epoch, rotate_pending FROM conversations WHERE id = ?', group.id).key_epoch, 2);
  await assert.rejects(cat.messages(group.id), { status: 404 });

  // Old messages stay readable, and editing one keeps its original key.
  const first = (await ben.messages(group.id))[0];
  assert.equal(first.text, 'before the phone');
  assert.match((await ann.edit((await ann.messages(group.id))[0], 'before the phone (edited)')).body, /^e1\.1\./);

  // Keys can only be handed to real devices of members.
  const bogus = await api(`/conversations/${group.id}/keys`, {
    token: signToken({ sub: 'md-ann' }, SECRET), method: 'POST',
    json: { keys: [{ userId: 'md-cat', deviceId: cat.identity.deviceId, epoch: 2, by: 'md-ann', byKey: 'x', data: 'y' }] },
  });
  assert.equal(bogus.status, 400);

  // A lost device can be removed.
  await ben.removeDevice(benPhone.identity.deviceId);
  assert.equal((await ben.devices()).length, 1);
});

test('encryption: a forged key for a new device is discarded and replaced by a real one', async () => {
  const e2ee = await import('../client/e2ee.js');
  const ann = await client('fk-ann');
  await client('fk-ben');
  const group = await ann.createGroup({ title: 'Careful', memberIds: ['fk-ben'], encrypted: true });
  await ann.send(group.id, { text: 'genuine' });

  // Ben's new phone exists, and someone has planted a key for it that opens nothing.
  const mem = new Map();
  const keyStore = { get: async (k) => mem.get(k), set: async (k, v) => void mem.set(k, v) };
  const identity = await e2ee.loadIdentity(keyStore, `identity:${url}:fk-ben`);
  chat.store.registerDevice('fk-ben', identity.deviceId, identity.publicKey);
  chat.store.addMemberKeys(group.id, [{ userId: 'fk-ben', deviceId: identity.deviceId, epoch: 1, by: 'fk-ann', byKey: ann.identity.publicKey, data: e2ee.b64(crypto.getRandomValues(new Uint8Array(60))) }]);

  const phone = new PlugChat({ url, getToken: async () => signToken({ sub: 'fk-ben' }, SECRET), keyStore });
  clients.push(phone);
  const repaired = next(phone, 'conversation', (c) => c.id === group.id && c.members.find((m) => m.userId === 'fk-ben').devices.find((d) => d.deviceId === identity.deviceId).keyed);
  await phone.connect();
  await phone.conversation(group.id); // tries the planted key, finds it useless, drops it
  await repaired;
  assert.equal((await phone.messages(group.id))[0].text, 'genuine');

  // and nobody can label a key as coming from someone else
  const forged = await api(`/conversations/${group.id}/keys`, {
    token: signToken({ sub: 'fk-ben' }, SECRET), method: 'POST',
    json: { keys: [{ userId: 'fk-ann', deviceId: ann.identity.deviceId, epoch: 1, by: 'fk-ann', byKey: 'x', data: 'y' }] },
  });
  assert.equal(forged.status, 400);
});

test('encryption: a passphrase backup restores history on a device with no one else online', async () => {
  const laptop = await client('bk-user');
  const friend = await client('bk-friend');
  const group = await laptop.createGroup({ title: 'Vault', memberIds: ['bk-friend'], encrypted: true });
  await laptop.send(group.id, { text: 'the combination is 12-34-56' });
  await assert.rejects(laptop.enableBackup('short'), { code: 'weak_passphrase' });
  await laptop.enableBackup('correct horse battery staple');

  const stored = chat.store.getBackup('bk-user');
  assert.ok(stored.data.length > 50);
  assert.ok(!stored.data.includes(group.id), 'the server cannot even see which conversations are inside');

  // The laptop is lost, and nobody else is online to hand over keys.
  laptop.close();
  friend.close();
  await new Promise((r) => setTimeout(r, 100));

  const phone = await client('bk-user');
  assert.deepEqual(await phone.backupStatus(), { exists: true, enabledHere: false });
  assert.equal((await phone.messages(group.id))[0].undecryptable, true, 'a brand-new device cannot read anything yet');
  await assert.rejects(phone.restoreBackup('wrong guess here'), { code: 'wrong_passphrase' });
  assert.equal(await phone.restoreBackup('correct horse battery staple'), 1);
  assert.equal((await phone.messages(group.id))[0].text, 'the combination is 12-34-56');
  assert.deepEqual(await phone.backupStatus(), { exists: true, enabledHere: true });
  assert.ok((await phone.send(group.id, { text: 'back in' })).body.startsWith('e1.1.'), 'and can write again');

  await phone.disableBackup();
  assert.equal(chat.store.getBackup('bk-user'), null);
  const other = signToken({ sub: 'bk-friend' }, SECRET);
  assert.equal((await api('/me/backup', { token: other })).status, 404, 'each person only ever reaches their own backup');
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

test('people are found by whatever the platform identifies them with', async () => {
  const tok = (claims) => signToken(claims, SECRET);
  const byEmail = new PlugChat({ url, getToken: async () => tok({ sub: 'h1', name: 'Hana', email: 'Hana@Example.com' }) });
  const byPhone = new PlugChat({ url, getToken: async () => tok({ sub: 'h2', name: 'Ibra', phone: '+233 (24) 555-0101' }) });
  const byMemberNo = new PlugChat({ url, getToken: async () => tok({ sub: 'h3', name: 'Jo', username: '@Jo_J', handles: { member_no: 'AA-0042' } }) });
  clients.push(byEmail, byPhone, byMemberNo);
  await Promise.all([byEmail.connect(), byPhone.connect(), byMemberNo.connect()]);

  assert.equal((await byPhone.findUser('hana@example.com')).id, 'h1');
  assert.equal((await byEmail.findUser('+233245550101')).id, 'h2', 'phone formatting does not matter');
  assert.equal((await byEmail.findUser('jo_j')).id, 'h3');
  assert.equal((await byEmail.findUser('aa-0042', 'member_no')).id, 'h3', 'custom handle kinds work');
  await assert.rejects(byEmail.findUser('hana@'), { status: 404 }, 'handles only match exactly');

  // other users never see your handles unless the host opts in
  assert.equal((await byPhone.findUser('hana@example.com')).handles, undefined);
  assert.deepEqual(byEmail.me.handles, { email: 'hana@example.com' });

  const dm = await byEmail.openDmByHandle('+233 24 555 0101');
  assert.deepEqual(dm.members.map((m) => m.userId).sort(), ['h1', 'h2']);

  // a handle cannot be claimed twice
  const admin = tok({ sub: 'host', admin: true });
  const clash = await api('/users/h9', { token: admin, method: 'PUT', json: { name: 'Imposter', handles: { email: 'hana@example.com' } } });
  assert.equal(clash.status, 409);
});

test('polls, including inside encrypted conversations', async () => {
  const alice = await client('alice');
  const bob = await client('bob');
  for (const encrypted of [false, true]) {
    const group = await alice.createGroup({ title: 'Vote', memberIds: ['bob'], encrypted });
    const poll = await alice.sendPoll(group.id, { question: 'Venue?', options: ['Accra', 'Kumasi', 'Tamale'] });
    assert.deepEqual(poll.poll.options, ['Accra', 'Kumasi', 'Tamale']);

    const seen = next(alice, 'message.updated', (m) => m.id === poll.id);
    await bob.vote(poll.id, [1]);
    assert.deepEqual((await seen).votes, { 1: ['bob'] });
    await assert.rejects(bob.vote(poll.id, [0, 2]), { status: 400 }, 'single-choice poll');
    await assert.rejects(bob.vote(poll.id, [7]), { status: 400 });
    if (encrypted) assert.ok(!chat.store.get('SELECT body FROM messages WHERE id = ?', poll.id).body.includes('Accra'));
  }
});

test('view-once messages can be opened a single time and are then wiped', async () => {
  const alice = await client('alice');
  const bob = await client('bob');
  const dm = await alice.openDm('bob');
  const file = new File(['secret-bytes'], 'pic.png', { type: 'image/png' });

  const incoming = next(bob, 'message', (m) => m.viewOnce);
  const sent = await alice.send(dm.id, { text: 'for your eyes only', file, viewOnce: true });
  const masked = await incoming;
  assert.equal(masked.text, '');
  assert.equal(masked.file, null);
  assert.equal(masked.hasFile, true);

  const fileId = chat.store.get('SELECT attachment FROM messages WHERE id = ?', sent.id).attachment.match(/"fileId":"([^"]+)"/)[1];
  const bobToken = signToken({ sub: 'bob' }, SECRET);
  assert.equal((await api(`/files/${fileId}`, { token: bobToken })).status, 404, 'no download before opening');
  await assert.rejects(alice.open(sent.id), { status: 403 });

  const opened = await bob.open(sent.id);
  assert.equal(opened.text, 'for your eyes only');
  assert.equal(await (await bob.download(opened)).text(), 'secret-bytes');
  await assert.rejects(bob.open(sent.id), { status: 410 });
  assert.equal((await bob.messages(dm.id)).find((m) => m.id === sent.id).text, '');

  assert.equal(chat.store.sweepViewOnce(60_000).length, 0, 'grace period still running');
  assert.equal(chat.store.sweepViewOnce(-1).length, 1);
  assert.equal(chat.store.get('SELECT body FROM messages WHERE id = ?', sent.id).body, '');
  assert.equal(chat.store.getFile(fileId), null);
});

test('pins, forwarding, mentions, per-user settings and search', async () => {
  const alice = await client('alice');
  const bob = await client('bob');
  await client('carol');
  const group = await alice.createGroup({ title: 'Planning', memberIds: ['bob', 'carol'] });

  const msg = await alice.send(group.id, { text: 'Budget is 4200 cedis', mentions: ['bob', 'not-a-member'] });
  assert.deepEqual(msg.mentions, ['bob']);

  await bob.pin(msg.id);
  assert.equal((await alice.pins(group.id))[0].id, msg.id);
  await bob.unpin(msg.id);
  assert.equal((await alice.pins(group.id)).length, 0);

  const dm = await bob.openDm('carol');
  const fwd = await bob.forward(msg, dm.id);
  assert.equal(fwd.forwarded, true);
  assert.equal(fwd.text, 'Budget is 4200 cedis');

  const muted = await bob.settings(group.id, { muted: true, pinned: true });
  assert.equal(muted.muted, true);
  assert.equal(muted.pinned, true);
  assert.equal((await alice.conversation(group.id)).muted, false, 'settings are private to each member');

  assert.ok((await bob.search('4200')).some((m) => m.id === msg.id));
  const eve = await client('eve');
  assert.equal((await eve.search('4200')).length, 0, 'search never reaches into conversations you are not in');
});

test('announcement channels: only admins post', async () => {
  const alice = await client('alice');
  const bob = await client('bob');
  const channel = await alice._req('POST', '/conversations', { json: { type: 'group', title: 'Notices', memberIds: ['bob'], announce: true } });
  await alice.send(channel.id, { text: 'AGM on Friday' });
  await assert.rejects(bob.send(channel.id, { text: 'ok' }), { status: 403 });
  await bob.react((await bob.messages(channel.id))[0].id, '👍');
});

test('stories are visible to peers only and report who viewed', async () => {
  const alice = await client('alice');
  const bob = await client('bob');
  const stranger = await client('stranger-1');
  await alice.openDm('bob');

  const posted = next(bob, 'story.new');
  const story = await alice.postStory({ text: 'At the reunion!', file: new File(['img'], 's.png', { type: 'image/png' }) });
  await posted;

  const feed = await bob.stories();
  const fromAlice = feed.find((g) => g.user.id === 'alice');
  assert.equal(fromAlice.stories[0].seen, false);
  assert.equal(await (await bob.storyFile(fromAlice.stories[0])).text(), 'img');
  await bob.viewStory(story.id);

  const mine = (await alice.stories())[0];
  assert.equal(mine.user.id, 'alice');
  assert.deepEqual(mine.stories.at(-1).views.map((v) => v.userId), ['bob']);

  assert.ok(!(await stranger.stories()).some((g) => g.user.id === 'alice'));
  await assert.rejects(stranger.viewStory(story.id), { status: 404 });
  await assert.rejects(stranger.storyFile(story), { status: 404 });
  await assert.rejects(bob.deleteStory(story.id), { status: 404 });
  await alice.deleteStory(story.id);
});

test('reports reach the host; call signalling only flows between members', async () => {
  const alice = await client('alice');
  const bob = await client('bob');
  const eve = await client('eve');
  const dm = await alice.openDm('bob');
  const msg = await alice.send(dm.id, { text: 'something rude' });

  await bob.report(msg.id, 'harassment');
  await assert.rejects(eve.report(msg.id, 'x'), { status: 404 });
  const reports = await (await api('/reports', { token: signToken({ sub: 'host', admin: true }, SECRET) })).json();
  assert.ok(reports.reports.some((r) => r.messageId === msg.id && r.reason === 'harassment' && r.message.body === 'something rude'));
  assert.equal((await api('/reports', { token: signToken({ sub: 'bob' }, SECRET) })).status, 403);

  const got = next(bob, 'signal');
  let leaked = false;
  eve.on('signal', () => (leaked = true));
  eve.signal(dm.id, 'bob', { call: 'x', t: 'invite' }); // not a member: dropped
  alice.signal(dm.id, 'bob', { call: 'c1', t: 'invite' });
  const sig = await got;
  assert.equal(sig.from, 'alice');
  assert.equal(sig.data.call, 'c1');
  assert.equal(leaked, false);
});

test('with the directory off, users cannot be enumerated; encryption can be made mandatory', async () => {
  const d = mkdtempSync(join(tmpdir(), 'plugchat-strict-'));
  const strict = createPlugChat({ secret: SECRET, dataDir: d, log: { error() {} }, directory: false, requireEncryption: true });
  const srv = await strict.listen(0);
  const base = `http://localhost:${srv.address().port}/plugchat`;
  const mk = async (sub, extra) => {
    const c = new PlugChat({ url: base, getToken: async () => signToken({ sub, ...extra }, SECRET) });
    await c.connect();
    return c;
  };
  const a = await mk('a', { email: 'a@x.test' });
  const b = await mk('b', { email: 'b@x.test' });
  const c = await mk('c');
  try {
    await assert.rejects(a.searchUsers(''), { status: 403 });
    await assert.rejects(a.user('b'), { status: 404 }, 'profiles of strangers are hidden');
    assert.equal((await a.findUser('b@x.test')).id, 'b', 'but an exact handle still resolves');

    await assert.rejects(a.openDm('b'), { status: 400 }, 'plaintext conversations are refused');
    const dm = await a.openDm('b', { encrypted: true });
    assert.equal(dm.encrypted, true);
    assert.equal((await a.user('b')).id, 'b', 'peers are visible');
    await assert.rejects(c.user('b'), { status: 404 });
  } finally {
    for (const x of [a, b, c]) x.close();
    srv.close();
    srv.closeAllConnections();
    strict.close();
    rmSync(d, { recursive: true, force: true });
  }
});

test('connectors: host hooks veto and rewrite, third-party call vendor, custom storage, custom messages', async () => {
  const d = mkdtempSync(join(tmpdir(), 'plugchat-conn-'));
  const credits = { rich: 2, broke: 0 };
  const bucket = new Map(); // stands in for S3 or any object store
  const { Readable } = await import('node:stream');
  const { createServer } = await import('node:http');

  // A hook endpoint as a backend in any language would expose it.
  const received = [];
  const hookServer = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const valid = req.headers['x-plugchat-signature'] === signWebhook(raw, SECRET);
    const body = JSON.parse(raw);
    received.push({ event: body.event, valid });
    res.setHeader('content-type', 'application/json');
    if (body.event === 'upload.before') return res.end(JSON.stringify({ allow: body.mime !== 'application/x-msdownload', reason: 'That file type is not allowed here' }));
    // call.join: mint a "vendor token" for this user and room
    res.end(JSON.stringify({ url: `https://calls.vendor.example/room/${body.call.id}?t=${body.userId}`, data: { vendor: 'acme-rtc', token: `tok-${body.userId}`, video: body.call.video } }));
  });
  await new Promise((r) => hookServer.listen(0, r));

  const hosted = createPlugChat({
    secret: SECRET, dataDir: d, log: { error() {} },
    storage: {
      put: (id, data) => void bucket.set(id, data),
      stream: (id) => Readable.from(bucket.get(id)),
      remove: (id) => void bucket.delete(id),
    },
    hooks: {
      // e.g. a pay-per-message platform, plus a moderation service
      'message.before': ({ message }) => {
        if (credits[message.senderId] <= 0) return { allow: false, reason: 'You are out of message credits' };
        credits[message.senderId] -= 1;
        if (message.kind === 'text') return { body: message.body.replace(/darn/gi, '****') };
      },
    },
    hookUrl: `http://localhost:${hookServer.address().port}/hooks`,
    hookEvents: ['upload.before', 'call.join'],
  });
  const srv = await hosted.listen(0);
  const base = `http://localhost:${srv.address().port}/plugchat`;
  const mk = async (sub) => {
    const c = new PlugChat({ url: base, getToken: async () => signToken({ sub }, SECRET) });
    await c.connect();
    return c;
  };
  const rich = await mk('rich');
  const broke = await mk('broke');
  try {
    assert.equal(rich.me.features.calls, 'external');
    const dm = await rich.openDm('broke');

    assert.equal((await rich.send(dm.id, { text: 'well darn' })).text, 'well ****', 'the host rewrote the message');
    await assert.rejects(broke.send(dm.id, { text: 'hi' }), { status: 403, message: 'You are out of message credits' });

    const custom = await rich.sendCustom(dm.id, { type: 'payment', data: { amount: 50, currency: 'GHS' }, text: 'Sent GHS 50' });
    assert.deepEqual(custom.custom, { type: 'payment', data: { amount: 50, currency: 'GHS' } });
    assert.equal(credits.rich, 0);
    await assert.rejects(rich.send(dm.id, { text: 'one more' }), { status: 403 });

    credits.rich = 5;
    const sent = await rich.send(dm.id, { file: new File(['in the bucket'], 'a.txt', { type: 'text/plain' }) });
    assert.equal(bucket.size, 1, 'the file went to the host-provided storage');
    assert.equal(await (await broke.download(sent)).text(), 'in the bucket');
    await assert.rejects(rich.send(dm.id, { file: new File(['MZ'], 'virus.exe', { type: 'application/x-msdownload' }) }), { message: 'That file type is not allowed here' });
    await rich.remove(sent.id);
    assert.equal(bucket.size, 0);

    const ring = next(broke, 'message', (m) => m.kind === 'call');
    const started = await rich.startCall(dm.id, { video: true });
    assert.equal(started.join.data.token, 'tok-rich');
    const marker = await ring;
    assert.deepEqual(marker.call, { callId: started.call.id, video: true });
    const joined = await broke.joinCall(marker.call.callId);
    assert.equal(joined.join.data.token, 'tok-broke', 'each participant gets their own vendor token');
    assert.match(joined.join.url, /^https:\/\/calls\.vendor\.example\/room\//);

    const outsider = await mk('outsider');
    await assert.rejects(outsider.joinCall(started.call.id), { status: 404 }, 'only conversation members can get a join token');
    outsider.close();
    assert.ok(received.length >= 4 && received.every((r) => r.valid), 'every hook request carried a valid signature');
  } finally {
    rich.close();
    broke.close();
    for (const s of [srv, hookServer]) (s.close(), s.closeAllConnections());
    hosted.close();
    rmSync(d, { recursive: true, force: true });
  }
});

test('a hook that is down blocks the action unless the host chose fail-open', async () => {
  for (const hookFailOpen of [false, true]) {
    const d = mkdtempSync(join(tmpdir(), 'plugchat-down-'));
    const inst = createPlugChat({ secret: SECRET, dataDir: d, log: { error() {} }, hookUrl: 'http://127.0.0.1:9/nothing', hookEvents: ['message.before'], hookTimeoutMs: 500, hookFailOpen });
    const srv = await inst.listen(0);
    const mk = async (sub) => {
      const c = new PlugChat({ url: `http://localhost:${srv.address().port}/plugchat`, getToken: async () => signToken({ sub }, SECRET) });
      await c.connect();
      return c;
    };
    const a = await mk('a');
    const b = await mk('b');
    try {
      const dm = await a.openDm('b');
      if (hookFailOpen) assert.equal((await a.send(dm.id, { text: 'through' })).text, 'through');
      else await assert.rejects(a.send(dm.id, { text: 'blocked' }), { status: 502 });
    } finally {
      a.close();
      b.close();
      srv.close();
      srv.closeAllConnections();
      inst.close();
      rmSync(d, { recursive: true, force: true });
    }
  }
});

test('invite codes let people join a group themselves; encrypted groups refuse them', async () => {
  const alice = await client('alice');
  const bob = await client('bob');
  const newcomer = await client('newcomer-1');
  const group = await alice.createGroup({ title: 'Open house', memberIds: ['bob'] });

  await assert.rejects(bob.createInvite(group.id), { status: 403 }, 'members cannot mint invites');
  const { code } = await alice.createInvite(group.id, { maxUses: 1 });
  assert.equal((await newcomer.invite(code)).title, 'Open house');

  const seen = next(alice, 'conversation', (c) => c.id === group.id && c.members.length === 3);
  const joined = await newcomer.joinByInvite(code);
  assert.equal(joined.id, group.id);
  await seen;
  await newcomer.send(group.id, { text: 'hello, I used the code' });

  const late = await client('newcomer-2');
  await assert.rejects(late.joinByInvite(code), { status: 404 }, 'a single-use code is spent');

  const second = await alice.createInvite(group.id);
  await alice.revokeInvite(group.id, second.code);
  await assert.rejects(late.joinByInvite(second.code), { status: 404 });

  const secret = await alice.createGroup({ title: 'Sealed', memberIds: ['bob'], encrypted: true });
  await assert.rejects(alice.createInvite(secret.id), { status: 400 });
});

test('data export covers what a user sent; the embed page is framable and locked down', async () => {
  const exporter = await client('exporter', 'Expo');
  await client('bob');
  const dm = await exporter.openDm('bob');
  await exporter.send(dm.id, { text: 'remember this' });
  await exporter.react((await exporter.messages(dm.id))[0].id, '👍');

  const data = await exporter.exportMyData();
  assert.equal(data.user.id, 'exporter');
  assert.ok(data.messages.some((m) => m.body === 'remember this'));
  assert.equal(data.conversations.length, 1);
  assert.equal(data.reactions.length, 1);
  assert.equal((await api('/users/bob/export', { token: signToken({ sub: 'exporter' }, SECRET) })).status, 403);
  assert.equal((await api('/users/bob/export', { token: signToken({ sub: 'host', admin: true }, SECRET) })).status, 200);

  const page = await fetch(`${url}/embed`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'.*frame-ancestors \*/);
  assert.match(await page.text(), /<plug-chat><\/plug-chat>/);
  for (const file of ['element.js', 'launcher.js', 'embed.js', 'plugchat.js', 'calls.js', 'e2ee.js']) {
    const res = await fetch(`${url}/client/${file}`);
    assert.equal(res.status, 200, file);
    const again = await fetch(`${url}/client/${file}`, { headers: { 'if-none-match': res.headers.get('etag') } });
    assert.equal(again.status, 304, `${file} revalidates`);
  }
  assert.equal((await fetch(`${url}/client/../server/index.js`)).status, 404);
  assert.equal((await fetch(`${url}/client/secrets.js`)).status, 404);
});

test('secret rotation keeps old tokens working; over-long tokens are refused', async () => {
  const OLD = 'the-old-secret-the-old-secret-the-old-secret';
  const d = mkdtempSync(join(tmpdir(), 'plugchat-rot-'));
  const inst = createPlugChat({ secret: SECRET, previousSecrets: [OLD], maxTokenLifetimeSeconds: 3600, dataDir: d, log: { error() {} } });
  const srv = await inst.listen(0);
  const me = (token) => fetch(`http://localhost:${srv.address().port}/plugchat/v1/me`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.status);
  try {
    assert.equal(await me(signToken({ sub: 'u' }, SECRET, 600)), 200);
    assert.equal(await me(signToken({ sub: 'u' }, OLD, 600)), 200, 'outgoing secret still accepted');
    assert.equal(await me(signToken({ sub: 'u' }, 'some-unknown-secret-some-unknown-secret', 600)), 401);
    assert.equal(await me(signToken({ sub: 'u' }, SECRET, 7200)), 401, 'a two-hour token exceeds the one-hour cap');
  } finally {
    srv.close();
    srv.closeAllConnections();
    inst.close();
    rmSync(d, { recursive: true, force: true });
  }
});

test('two instances sharing a database behave as one', async () => {
  const d = mkdtempSync(join(tmpdir(), 'plugchat-cluster-'));
  const opts = { secret: SECRET, dataDir: d, log: { error() {} }, cluster: true };
  const one = createPlugChat(opts);
  const two = createPlugChat(opts);
  const [s1, s2] = [await one.listen(0), await two.listen(0)];
  const mk = async (srv, sub) => {
    const c = new PlugChat({ url: `http://localhost:${srv.address().port}/plugchat`, getToken: async () => signToken({ sub }, SECRET) });
    await c.connect();
    return c;
  };
  const ann = await mk(s1, 'ann'); // connected to instance one
  const bob = await mk(s2, 'bob'); // connected to instance two
  try {
    const dm = await ann.openDm('bob');
    const got = next(bob, 'message');
    await ann.send(dm.id, { text: 'across instances' });
    assert.equal((await got).text, 'across instances');

    assert.equal((await ann.user('bob')).online, true, 'presence is shared');
    const typing = next(ann, 'typing');
    bob.typing(dm.id);
    assert.equal((await typing).userId, 'bob');

    const offline = next(ann, 'presence', (e) => e.userId === 'bob' && !e.online);
    bob.close();
    await offline;
    assert.equal((await ann.user('bob')).online, false);
  } finally {
    ann.close();
    bob.close();
    for (const s of [s1, s2]) (s.close(), s.closeAllConnections());
    one.close();
    two.close();
    rmSync(d, { recursive: true, force: true });
  }
});

test('privacy: read receipts and online status can be switched off', async () => {
  const shy = await client('shy-1');
  const pal = await client('pal-1');
  const dm = await pal.openDm('shy-1');
  await shy.setPrivacy({ readReceipts: false, presence: false });

  const msg = await pal.send(dm.id, { text: 'did you see this?' });
  let leaked = false;
  const off = pal.on('read', (e) => e.userId === 'shy-1' && (leaked = true));
  await shy.read(dm.id, msg.seq);
  assert.equal((await shy.conversation(dm.id)).unread, 0, 'it still counts as read for the reader');
  assert.equal((await pal.conversation(dm.id)).members.find((m) => m.userId === 'shy-1').lastReadSeq, 0);
  assert.equal((await pal.user('shy-1')).online, false, 'appears offline to others');
  assert.equal((await shy.user('shy-1')).online, true);
  await new Promise((r) => setTimeout(r, 100));
  off();
  assert.equal(leaked, false);

  const back = next(pal, 'presence', (e) => e.userId === 'shy-1' && e.online);
  assert.deepEqual(await shy.setPrivacy({ presence: true }), { readReceipts: false, presence: true });
  await back;
});

test('starred messages are private; history can be entered at any point', async () => {
  const alice = await client('alice');
  const bob = await client('bob');
  const group = await alice.createGroup({ title: 'Long thread', memberIds: ['bob'] });
  const sent = [];
  for (let i = 1; i <= 30; i++) sent.push(await alice.send(group.id, { text: `message ${i}` }));

  await bob.star(sent[9].id);
  assert.deepEqual((await bob.starred()).map((m) => m.text), ['message 10']);
  assert.equal((await alice.starred()).some((m) => m.id === sent[9].id), false);
  assert.equal((await bob.messages(group.id)).find((m) => m.id === sent[9].id).starred, true);
  assert.equal((await alice.messages(group.id)).find((m) => m.id === sent[9].id).starred, false);
  await bob.unstar(sent[9].id);
  assert.equal((await bob.starred()).length, 0);

  const window = await bob.messages(group.id, { around: sent[14].seq, limit: 10 });
  assert.deepEqual(window.map((m) => m.text), ['message 11', 'message 12', 'message 13', 'message 14', 'message 15', 'message 16', 'message 17', 'message 18', 'message 19', 'message 20']);
  assert.deepEqual((await bob.messages(group.id, { after: sent[27].seq })).map((m) => m.text), ['message 29', 'message 30']);
  assert.equal((await bob.message(sent[4].id)).text, 'message 5');
  const eve = await client('eve');
  await assert.rejects(eve.message(sent[4].id), { status: 404 });
  await assert.rejects(eve.star(sent[4].id), { status: 404 });
});

test('ownership transfer, suspension, storage quota and the in-process host API', async () => {
  const d = mkdtempSync(join(tmpdir(), 'plugchat-host-'));
  const inst = createPlugChat({ secret: SECRET, dataDir: d, log: { error() {} }, userStorageBytes: 10 });
  const srv = await inst.listen(0);
  const mk = async (sub) => {
    const c = new PlugChat({ url: `http://localhost:${srv.address().port}/plugchat`, getToken: async () => signToken({ sub }, SECRET) });
    await c.connect();
    return c;
  };
  try {
    // The host sets things up with plain function calls, no HTTP.
    await inst.admin.upsertUser('m1', { name: 'Mina', handles: { email: 'mina@x.test' } });
    await inst.admin.upsertUser('m2', { name: 'Nii' });
    const group = await inst.admin.createGroup({ title: 'Order #1042', memberIds: ['m1', 'm2'], createdBy: 'm1' });
    await inst.admin.post(group.id, 'Your order has shipped');
    await assert.rejects(inst.admin.upsertUser('m3', { handles: { email: 'mina@x.test' } }), { status: 409 });

    const mina = await mk('m1');
    const nii = await mk('m2');
    assert.equal((await mina.messages(group.id))[0].text, 'Your order has shipped');
    assert.deepEqual(await inst.admin.unread('m2'), { total: 1, conversations: [{ id: group.id, type: 'group', title: 'Order #1042', unread: 1, muted: false }] });

    // ownership
    await assert.rejects(nii.setRole(group.id, 'm1', 'member'), { status: 403 });
    const handed = await mina.setRole(group.id, 'm2', 'owner');
    assert.deepEqual(handed.members.map((m) => m.role).sort(), ['admin', 'owner']);
    assert.equal(handed.members.find((m) => m.userId === 'm2').role, 'owner');

    // storage quota (10 bytes per person in this instance)
    await mina.send(group.id, { file: new File(['12345678'], 'a.txt') });
    await assert.rejects(mina.send(group.id, { file: new File(['12345678'], 'b.txt') }), { status: 413, code: 'quota_exceeded' });

    // suspension: can read, cannot write
    await inst.admin.suspend('m2', 'Suspended for spam');
    await assert.rejects(nii.send(group.id, { text: 'hello?' }), { status: 403, message: 'Suspended for spam' });
    assert.ok((await nii.messages(group.id)).length >= 2);
    await inst.admin.unsuspend('m2');
    await nii.send(group.id, { text: 'back' });

    const stats = await inst.admin.stats();
    assert.equal(stats.users, 2);
    assert.equal(stats.fileBytes, 8);
    mina.close();
    nii.close();
  } finally {
    srv.close();
    srv.closeAllConnections();
    inst.close();
    rmSync(d, { recursive: true, force: true });
  }
});

test('moderation console: served locked down, reports carry names and can be dismissed', async () => {
  const page = await fetch(`${url}/admin`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${url}/client/admin.js`)).status, 200);

  const alice = await client('mod-alice', 'Alice');
  const bob = await client('mod-bob', 'Bob');
  const dm = await alice.openDm('mod-bob');
  const msg = await alice.send(dm.id, { text: 'buy my coins' });
  const { reportId } = await bob.report(msg.id, 'Scam or fraud');

  const admin = signToken({ sub: 'staff', admin: true }, SECRET);
  const { reports } = await (await api('/reports', { token: admin })).json();
  const mine = reports.find((r) => r.id === reportId);
  assert.equal(mine.reporterName, 'Bob');
  assert.equal(mine.senderName, 'Alice');
  assert.equal(mine.senderSuspended, false);

  assert.equal((await api(`/reports/${reportId}`, { token: signToken({ sub: 'mod-bob' }, SECRET), method: 'DELETE' })).status, 403);
  assert.equal((await api(`/reports/${reportId}`, { token: admin, method: 'DELETE' })).status, 200);
  assert.equal((await api(`/reports/${reportId}`, { token: admin, method: 'DELETE' })).status, 404);
  const found = await (await api('/users?q=mod-alice', { token: admin })).json();
  assert.equal(found.users[0].suspended, null, 'admins see suspension state');
  assert.equal((await bob.user('mod-alice')).suspended, undefined, 'other users do not');
});

test('a conversation lists what was shared in it, without view-once or deleted files', async () => {
  const a = await client('media-a');
  const b = await client('media-b');
  const outsider = await client('media-c');
  const dm = await a.openDm('media-b');
  await a.send(dm.id, { text: 'no file here' });
  const photo = await a.send(dm.id, { file: new File(['png'], 'photo.png', { type: 'image/png' }) });
  const doc = await b.send(dm.id, { text: 'the minutes', file: new File(['pdf'], 'minutes.pdf', { type: 'application/pdf' }) });
  await a.send(dm.id, { file: new File(['secret'], 'once.png', { type: 'image/png' }), viewOnce: true });
  const gone = await a.send(dm.id, { file: new File(['x'], 'gone.txt') });
  await a.remove(gone.id);

  const shared = await b.attachments(dm.id);
  assert.deepEqual(shared.map((m) => m.file.name), ['minutes.pdf', 'photo.png']);
  assert.deepEqual(shared.map((m) => m.id), [doc.id, photo.id]);
  await assert.rejects(outsider.attachments(dm.id), { status: 404 });
});

test('admin actions are audited; backup and doctor commands work', async () => {
  const { execFileSync, spawnSync } = await import('node:child_process');
  const { existsSync, readFileSync } = await import('node:fs');
  const d = mkdtempSync(join(tmpdir(), 'plugchat-ops-'));
  const inst = createPlugChat({ secret: SECRET, dataDir: join(d, 'data'), log: { error() {} } });
  await inst.admin.upsertUser('op1', { name: 'Op One' });
  await inst.admin.upsertUser('op2', { name: 'Op Two' });
  const dm = await inst.admin.openDm('op1', 'op2');
  const msg = await inst.admin.post(dm.id, { kind: 'text', senderId: 'op1', body: 'keep me in the backup' });
  await inst.admin.suspend('op2', 'testing');
  await inst.admin.exportUser('op1');
  await inst.admin.deleteMessage(msg.id);
  const { entries } = await inst.api('GET', '/v1/audit');
  assert.deepEqual(entries.map((e) => e.action).reverse(), [
    'PUT /v1/users/op2/suspension', 'GET /v1/users/op1/export', `DELETE /v1/messages/${msg.id}`,
  ], 'sensitive actions are recorded; routine ones are not');
  assert.equal(entries[0].actor, 'host');

  const cli = fileURLToPath(new URL('../bin/plugchat.js', import.meta.url));
  const envFor = (extra) => ({ ...process.env, PLUGCHAT_DATA: join(d, 'data'), ...extra });
  execFileSync(process.execPath, [cli, 'backup', join(d, 'copy')], { env: envFor({}) });
  assert.ok(existsSync(join(d, 'copy', 'plugchat.db')));
  assert.ok(readFileSync(join(d, 'copy', 'plugchat.db')).length > 4096);
  assert.equal(spawnSync(process.execPath, [cli, 'backup', join(d, 'copy')], { env: envFor({}) }).status, 1, 'never overwrites an existing backup');

  const good = spawnSync(process.execPath, [cli, 'doctor'], { env: envFor({ PLUGCHAT_SECRET: SECRET, PLUGCHAT_ORIGINS: 'https://example.com' }), encoding: 'utf8' });
  assert.equal(good.status, 0, good.stdout);
  const bad = spawnSync(process.execPath, [cli, 'doctor'], { env: envFor({ PLUGCHAT_SECRET: 'short', PLUGCHAT_ORIGINS: 'example.com/path' }), encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /at least 32/);
  assert.match(bad.stdout, /must look like https/);

  inst.close();
  rmSync(d, { recursive: true, force: true });
});

test('scheduled messages go out on time, as their author, through the host hooks', async () => {
  const d = mkdtempSync(join(tmpdir(), 'plugchat-sched-'));
  const seenByHook = [];
  const inst = createPlugChat({
    secret: SECRET, dataDir: d, log: { error() {} }, schedulePollMs: 100,
    hooks: { 'message.before': ({ message }) => (seenByHook.push(message.senderId), message.body.includes('blocked word') ? { allow: false, reason: 'Not allowed here' } : undefined) },
  });
  const srv = await inst.listen(0);
  const mk = async (sub) => {
    const c = new PlugChat({ url: `http://localhost:${srv.address().port}/plugchat`, getToken: async () => signToken({ sub }, SECRET) });
    await c.connect();
    return c;
  };
  const sam = await mk('sam');
  const tia = await mk('tia');
  try {
    const dm = await sam.openDm('tia');
    await assert.rejects(sam.schedule(dm.id, { text: 'too soon' }, Date.now() + 100), { status: 400 });
    const job = await sam.schedule(dm.id, { text: 'happy birthday!' }, Date.now() + 6000);
    const doomed = await sam.schedule(dm.id, { text: 'a blocked word inside' }, Date.now() + 6000);
    assert.deepEqual((await sam.scheduled()).map((s) => s.text), ['happy birthday!', 'a blocked word inside']);
    assert.equal((await tia.scheduled()).length, 0, 'only the author sees their scheduled messages');
    await assert.rejects(tia.cancelScheduled(job.id), { status: 404 });
    assert.equal((await tia.messages(dm.id)).length, 0, 'nothing is delivered early');

    // Bring the time forward instead of waiting.
    const arrived = next(tia, 'message');
    const failed = next(sam, 'scheduled.failed');
    inst.store.run('UPDATE scheduled SET send_at = ?', Date.now() - 1);
    const got = await arrived;
    assert.equal(got.text, 'happy birthday!');
    assert.equal(got.senderId, 'sam');
    assert.equal((await failed).id, doomed.id);
    assert.ok(seenByHook.includes('sam'), 'the host hook saw it as a normal send');

    const left = await sam.scheduled();
    assert.equal(left.length, 1);
    assert.equal(left[0].error, 'Not allowed here');
    await sam.cancelScheduled(doomed.id);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await tia.messages(dm.id)).length, 1, 'sent exactly once');
  } finally {
    sam.close();
    tia.close();
    srv.close();
    srv.closeAllConnections();
    inst.close();
    rmSync(d, { recursive: true, force: true });
  }
});

test('link previews come only from the host hook, are cached, and are off without one', async () => {
  const alice = await client('alice');
  assert.equal(alice.me.features.linkPreviews, false);
  assert.equal(await alice.preview('https://example.com/a'), null, 'no hook, no preview');

  const d = mkdtempSync(join(tmpdir(), 'plugchat-prev-'));
  let asked = 0;
  const inst = createPlugChat({
    secret: SECRET, dataDir: d, log: { error() {} },
    hooks: { 'link.preview': ({ url: target }) => (asked++, target.includes('known') ? { title: 'Annual meeting', description: 'Friday at 6pm', siteName: 'Alumni', image: 'ignored' } : {}) },
  });
  const srv = await inst.listen(0);
  const user = new PlugChat({ url: `http://localhost:${srv.address().port}/plugchat`, getToken: async () => signToken({ sub: 'p1' }, SECRET) });
  try {
    await user.connect();
    assert.equal(user.me.features.linkPreviews, true);
    assert.deepEqual(await user.preview('https://site.example/known'), { url: 'https://site.example/known', title: 'Annual meeting', description: 'Friday at 6pm', siteName: 'Alumni' });
    await user.preview('https://site.example/known');
    assert.equal(asked, 1, 'the second request was served from the cache');
    assert.equal(await user.preview('https://site.example/other'), null);
    await assert.rejects(user.preview('javascript:alert(1)'), { status: 400 });
  } finally {
    user.close();
    srv.close();
    srv.closeAllConnections();
    inst.close();
    rmSync(d, { recursive: true, force: true });
  }
});

test('profile pictures: people and groups, real images only, letters as the fallback', async () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
  const ana = await client('pic-ana', 'Ana');
  const ben = await client('pic-ben', 'Ben');
  const group = await ana.createGroup({ title: 'Picnic', memberIds: ['pic-ben'] });
  assert.equal(ana.me.avatar, null);
  assert.equal(group.avatar, null, 'no picture yet: clients fall back to initials');

  const told = next(ben, 'user.updated', (u) => u.id === 'pic-ana');
  await ana.setAvatar(new Blob([PNG], { type: 'image/png' }));
  assert.match(ana.me.avatar, /^pc:[0-9a-f-]{36}$/);
  assert.equal((await told).avatar, ana.me.avatar, 'the people who know her are told');
  assert.equal(ben._convs.get(group.id).members.find((m) => m.userId === 'pic-ana').avatar, ana.me.avatar);

  const shown = await fetch(await ben.avatarUrl(ana.me.avatar));
  assert.deepEqual(new Uint8Array(await shown.arrayBuffer()), PNG);
  assert.equal(shown.headers.get('content-type'), 'image/png');

  // not an image, whatever it claims to be
  await assert.rejects(ana.setAvatar(new Blob(['<svg onload=alert(1)>'], { type: 'image/png' })), { status: 400 });
  await assert.rejects(ana.setAvatar(new Blob([new Uint8Array(700 * 1024)], { type: 'image/png' })), { status: 413 });

  // replacing removes the old file; removing falls back to none
  const first = ana.me.avatar.slice(3);
  await ana.setAvatar(new Blob([PNG], { type: 'image/png' }));
  assert.equal(chat.store.getFile(first), null);
  await ana.removeAvatar();
  assert.equal(ana.me.avatar, null);

  // a platform-supplied picture is used until the person uploads their own
  const linked = new PlugChat({ url, getToken: async () => signToken({ sub: 'pic-cal', name: 'Cal', avatar: 'https://cdn.example/cal.jpg' }, SECRET) });
  clients.push(linked);
  await linked.connect();
  assert.equal(linked.me.avatar, 'https://cdn.example/cal.jpg');
  assert.equal(await linked.avatarUrl(linked.me.avatar), 'https://cdn.example/cal.jpg');
  await linked.setAvatar(new Blob([PNG], { type: 'image/png' }));
  assert.match(linked.me.avatar, /^pc:/);

  // groups: admins only
  await assert.rejects(ben.setGroupAvatar(group.id, new Blob([PNG], { type: 'image/png' })), { status: 403 });
  const pictured = await ana.setGroupAvatar(group.id, new Blob([PNG], { type: 'image/png' }));
  const groupPicture = pictured.avatar;
  assert.match(groupPicture, /^pc:/);
  assert.equal((await ben.conversation(group.id)).avatar, groupPicture);
  assert.equal((await api('/files/' + groupPicture.slice(3), { token: signToken({ sub: 'pic-ben' }, SECRET) })).status, 404, 'pictures are not reachable as ordinary files');
  assert.equal((await ana.removeGroupAvatar(group.id)).avatar, null);

  await ana.setAbout('  Class of 2012  ');
  assert.equal((await ben.user('pic-ana')).about, 'Class of 2012');
});

test('platform notices arrive in a read-only inbox', async () => {
  const user = await client('notify-1', 'Nana');
  const arrived = next(user, 'message');
  await chat.admin.notify('notify-1', 'Your dues payment was received');
  assert.equal((await arrived).text, 'Your dues payment was received');
  await chat.admin.notify('notify-1', 'Reminder: AGM on Friday');

  const inbox = (await user.conversations()).filter((c) => c.title === 'Notifications');
  assert.equal(inbox.length, 1, 'notices share one conversation');
  assert.equal(inbox[0].unread, 2);
  assert.deepEqual((await user.messages(inbox[0].id)).map((m) => m.kind), ['system', 'system']);
  await assert.rejects(user.send(inbox[0].id, { text: 'can I reply?' }), { status: 403 });
  assert.equal((await api('/users/notify-1/notify', { token: signToken({ sub: 'notify-1' }, SECRET), method: 'POST', json: { text: 'x' } })).status, 403);
});

test('webhooks are retried until the host accepts them; retention purges old messages', async () => {
  const { createServer } = await import('node:http');
  const seen = [];
  let failuresLeft = 2;
  const host = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    seen.push({ attempt: Number(req.headers['x-plugchat-attempt']), delivery: req.headers['x-plugchat-delivery'], valid: req.headers['x-plugchat-signature'] === signWebhook(raw, SECRET), type: JSON.parse(raw).type });
    res.writeHead(failuresLeft-- > 0 ? 503 : 200).end();
  });
  await new Promise((r) => host.listen(0, r));
  const d = mkdtempSync(join(tmpdir(), 'plugchat-hook-'));
  const inst = createPlugChat({ secret: SECRET, dataDir: d, log: { error() {} }, webhookUrl: `http://localhost:${host.address().port}/`, webhookRetryBaseMs: 100, retentionDays: 30 });
  try {
    await inst.admin.upsertUser('w1', { name: 'W1' });
    await inst.admin.upsertUser('w2', { name: 'W2' });
    const dm = await inst.admin.openDm('w1', 'w2');
    await inst.admin.post(dm.id, { kind: 'text', senderId: 'w1', body: 'are you there?' });

    for (let i = 0; i < 40 && seen.length < 3; i++) await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(seen.map((s) => s.attempt), [1, 2, 3], 'two failures, then accepted');
    assert.ok(seen.every((s) => s.valid && s.type === 'message.new' && s.delivery === seen[0].delivery));
    assert.equal(inst.store.dueWebhooks().length, 0);
    assert.equal(inst.store.get('SELECT COUNT(*) AS n FROM webhook_queue').n, 0, 'the queue is empty once delivered');

    inst.store.run('UPDATE messages SET created_at = ? WHERE conversation_id = ?', Date.now() - 40 * 86_400_000, dm.id);
    await inst.admin.post(dm.id, { kind: 'text', senderId: 'w2', body: 'recent' });
    inst.store.purgeOlderThan(Date.now() - 30 * 86_400_000);
    assert.deepEqual(inst.store.all('SELECT body FROM messages WHERE conversation_id = ?', dm.id).map((r) => r.body), ['recent']);
  } finally {
    inst.close();
    host.close();
    host.closeAllConnections();
    rmSync(d, { recursive: true, force: true });
  }
});

test('every interface string has a translation in every shipped language', async () => {
  const { readFileSync } = await import('node:fs');
  const { DICTIONARIES } = await import('../client/i18n.js');
  const source = readFileSync(new URL('../client/element.js', import.meta.url), 'utf8');
  const used = new Set([...source.matchAll(/\bT\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]));
  assert.ok(used.size > 100, 'the scan found the interface strings');
  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    const untranslated = [...used].filter((key) => !(key in dict));
    assert.deepEqual(untranslated, [], `missing in "${lang}"`);
    for (const [key, value] of Object.entries(dict)) {
      const holes = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      assert.equal(holes(value), holes(key), `placeholders differ in "${lang}" for: ${key}`);
    }
  }
});

test('writes are rate limited per user', async () => {
  const d = mkdtempSync(join(tmpdir(), 'plugchat-rl-'));
  const limited = createPlugChat({ secret: SECRET, dataDir: d, log: { error() {} }, rateLimit: { perSecond: 1, burst: 3 } });
  const srv = await limited.listen(0);
  const token = signToken({ sub: 'spammer' }, SECRET);
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`http://localhost:${srv.address().port}/plugchat/v1/me/key`, {
      method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{"deviceId":"d","publicKey":"k"}',
    });
    statuses.push(res.status);
  }
  assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
  srv.close();
  srv.closeAllConnections();
  limited.close();
  rmSync(d, { recursive: true, force: true });
});

test('webhook signatures verify with the shared secret', () => {
  const body = JSON.stringify({ type: 'message.new' });
  assert.match(signWebhook(body, SECRET), /^sha256=[0-9a-f]{64}$/);
  assert.notEqual(signWebhook(body, SECRET), signWebhook(body + ' ', SECRET));
});
