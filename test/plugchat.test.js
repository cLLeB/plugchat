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

test('writes are rate limited per user', async () => {
  const d = mkdtempSync(join(tmpdir(), 'plugchat-rl-'));
  const limited = createPlugChat({ secret: SECRET, dataDir: d, log: { error() {} }, rateLimit: { perSecond: 1, burst: 3 } });
  const srv = await limited.listen(0);
  const token = signToken({ sub: 'spammer' }, SECRET);
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`http://localhost:${srv.address().port}/plugchat/v1/me/key`, {
      method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{"publicKey":"k"}',
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
