// What a host platform's developer relies on: switching features off, hearing
// about events, plugins, and keeping uploads in their own bucket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createPlugChat, signToken, FEATURES, EVENTS } from '../server/index.js';
import { signV4, s3Storage } from '../server/connectors.js';

const SECRET = 'test-secret-test-secret-test-secret-0123456789';
const quiet = { error() {} };

async function withChat(options, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'plugchat-int-'));
  const chat = createPlugChat({ secret: SECRET, dataDir: dir, log: quiet, rateLimit: { perSecond: 1000, burst: 1000 }, ...options });
  const server = await chat.listen(0);
  const url = `http://localhost:${server.address().port}/plugchat/v1`;
  const as = (sub) => (path, { method = 'GET', json } = {}) =>
    fetch(url + path, {
      method,
      headers: { authorization: `Bearer ${signToken({ sub, name: sub }, SECRET)}`, ...(json ? { 'content-type': 'application/json' } : {}) },
      body: json ? JSON.stringify(json) : undefined,
    });
  try {
    await fn({ chat, as });
  } finally {
    server.close();
    server.closeAllConnections();
    chat.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a host can switch features off: the server refuses them and tells the interface', async () => {
  assert.throws(() => createPlugChat({ secret: SECRET, features: { teleport: false } }), /unknown feature "teleport"/);

  await withChat({ features: { stories: false, polls: false, reactions: false, groups: false, editing: false, scheduled: false, stars: false, files: false } }, async ({ chat, as }) => {
    const ama = as('ama');
    await ama('/me');
    await as('kofi')('/me');

    const me = await (await ama('/me')).json();
    assert.equal(me.features.stories, false);
    assert.equal(me.features.polls, false);
    assert.equal(me.features.pins, true, 'everything not mentioned stays on');
    for (const f of FEATURES) assert.equal(typeof me.features[f] === 'boolean' || f === 'calls', true, f);

    const dm = await (await ama('/conversations', { method: 'POST', json: { type: 'dm', memberIds: ['kofi'] } })).json();
    const sent = await (await ama(`/conversations/${dm.id}/messages`, { method: 'POST', json: { body: 'hello' } })).json();
    assert.equal(sent.body, 'hello', 'plain messaging is untouched');

    const refused = async (res, label) => {
      assert.equal(res.status, 404, label);
      assert.equal((await res.json()).error,'feature_disabled', label);
    };
    await refused(await ama('/stories'), 'stories');
    await refused(await ama(`/messages/${sent.id}/reactions/${encodeURIComponent('👍')}`, { method: 'PUT' }), 'reactions');
    await refused(await ama(`/messages/${sent.id}`, { method: 'PATCH', json: { body: 'edited' } }), 'editing');
    await refused(await ama(`/messages/${sent.id}/star`, { method: 'PUT' }), 'stars');
    await refused(await ama('/scheduled'), 'scheduled');
    await refused(await ama(`/conversations/${dm.id}/files`, { method: 'POST' }), 'files');
    await refused(await ama('/conversations', { method: 'POST', json: { type: 'group', title: 'Class of 2010', memberIds: ['kofi'] } }), 'groups');
    await refused(await ama(`/conversations/${dm.id}/messages`, { method: 'POST', json: { kind: 'poll', body: JSON.stringify({ question: 'q', options: ['a', 'b'] }), poll: { options: 2 } } }), 'polls');

    // The platform's own backend is not restricted by what it hides from members.
    const group = await chat.admin.createGroup({ title: 'Announcements', memberIds: ['ama', 'kofi'] });
    assert.equal(group.type, 'group');
  });
});

test('events reach in-process listeners and plugins; the webhook only carries the chosen ones', async () => {
  const hooked = [];
  const host = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    hooked.push(JSON.parse(raw).type);
    res.writeHead(200).end();
  });
  await new Promise((r) => host.listen(0, r));
  const fromPlugin = [];
  const plugin = (chat) => chat.on('message.new', (e) => fromPlugin.push(e.message.body));

  assert.throws(() => createPlugChat({ secret: SECRET, webhookEvents: ['nope'] }), /unknown webhook event/);
  try {
    await withChat({ plugins: [plugin], webhookUrl: `http://localhost:${host.address().port}/`, webhookEvents: ['message.deleted', 'member.removed'] }, async ({ chat, as }) => {
      assert.throws(() => chat.on('nope', () => {}), /unknown event/);
      const seen = [];
      const stop = chat.on('*', (e) => seen.push(e.type));
      chat.on('message.new', () => { throw new Error('a broken listener must not break the request'); });

      const ama = as('ama');
      await ama('/me');
      await as('kofi')('/me');
      await as('esi')('/me');
      const group = await (await ama('/conversations', { method: 'POST', json: { type: 'group', title: 'Reunion', memberIds: ['kofi'] } })).json();
      const m = await (await ama(`/conversations/${group.id}/messages`, { method: 'POST', json: { body: 'first' } })).json();
      assert.equal(m.body, 'first');
      await ama(`/messages/${m.id}`, { method: 'PATCH', json: { body: 'first (fixed)' } });
      await ama(`/conversations/${group.id}/members`, { method: 'POST', json: { userIds: ['esi'] } });
      await ama(`/conversations/${group.id}/members/esi`, { method: 'DELETE' });
      await ama(`/messages/${m.id}`, { method: 'DELETE' });

      assert.deepEqual(seen, ['conversation.created', 'message.new', 'message.edited', 'member.added', 'member.removed', 'message.deleted']);
      assert.deepEqual(fromPlugin, ['first']);
      for (const type of seen) assert.ok(EVENTS.includes(type));

      stop();
      await ama(`/conversations/${group.id}/messages`, { method: 'POST', json: { body: 'second' } });
      assert.equal(seen.length, 6, 'a stopped listener hears nothing more');

      for (let i = 0; i < 40 && hooked.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
      assert.deepEqual(hooked.sort(), ['member.removed', 'message.deleted']);
    });
  } finally {
    host.close();
    host.closeAllConnections();
  }
});

test('request signing matches the published AWS example', () => {
  const signed = signV4({
    method: 'GET',
    url: 'https://example.amazonaws.com/',
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    service: 'service',
    now: new Date('2015-08-30T12:36:00Z'),
  });
  assert.equal(
    signed.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
  );
});

test('uploads can live in the host\'s own S3-compatible bucket, set up with plain settings', async () => {
  const keys = { accessKeyId: 'host-key', secretAccessKey: 'host-secret' };
  const objects = new Map();
  const rejected = [];
  // A stand-in for S3/R2/MinIO that checks every signature the way the real ones do.
  const bucket = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const d = req.headers['x-amz-date'];
    const now = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`);
    const expected = signV4({
      method: req.method, url: `http://${req.headers.host}${req.url}`, headers: { 'x-amz-content-sha256': req.headers['x-amz-content-sha256'] },
      payloadHash: req.headers['x-amz-content-sha256'], ...keys, region: 'auto', service: 's3', now,
    }).authorization;
    if (req.headers.authorization !== expected) return rejected.push(req.url), res.writeHead(403).end();
    if (req.method === 'PUT') return objects.set(req.url, body), res.writeHead(200).end();
    if (req.method === 'DELETE') return res.writeHead(objects.delete(req.url) ? 204 : 404).end();
    if (!objects.has(req.url)) return res.writeHead(404).end();
    res.writeHead(200).end(objects.get(req.url));
  });
  await new Promise((r) => bucket.listen(0, r));
  const settings = { type: 's3', bucket: 'alumni-chat', endpoint: `http://localhost:${bucket.address().port}`, region: 'auto', prefix: 'chat/', ...keys };
  try {
    const storage = s3Storage(settings);
    await storage.put('file-1', Buffer.from('a photo'));
    assert.deepEqual([...objects.keys()], ['/alumni-chat/chat/file-1']);
    let text = '';
    for await (const chunk of await storage.stream('file-1')) text += chunk;
    assert.equal(text, 'a photo');
    await storage.remove('file-1');
    await storage.remove('file-1'); // already gone is not an error
    assert.equal(objects.size, 0);
    assert.deepEqual(rejected, []);

    await assert.rejects(s3Storage({ ...settings, secretAccessKey: 'wrong' }).put('x', Buffer.from('x')), /403/);
    assert.throws(() => createPlugChat({ secret: SECRET, storage: { type: 'ftp' } }), /unknown storage type/);
    await withChat({ storage: settings }, async ({ as }) => assert.equal((await as('ama')('/me')).status, 200));
  } finally {
    bucket.close();
    bucket.closeAllConnections();
  }
});
