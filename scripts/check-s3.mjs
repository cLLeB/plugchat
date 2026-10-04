// Checks PlugChat's bucket storage against a real S3-compatible server: yours.
//
//   S3_ENDPOINT=http://127.0.0.1:8333 S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... S3_BUCKET=plugchat-check node scripts/check-s3.mjs
//
// (leave S3_ENDPOINT out for Amazon S3 and set S3_REGION). It creates the bucket
// if it can, sends a file through PlugChat, reads it back, deletes the message
// and confirms the object is gone. Nothing is left behind except the empty bucket.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlugChat, signToken } from '../server/index.js';
import { signV4 } from '../server/connectors.js';

const env = process.env;
const settings = { type: 's3', bucket: env.S3_BUCKET ?? 'plugchat-check', region: env.S3_REGION ?? 'us-east-1', endpoint: env.S3_ENDPOINT, accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY, prefix: 'check/' };
if (!settings.accessKeyId || !settings.secretAccessKey) {
  console.error('Set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (and S3_ENDPOINT unless it is Amazon S3).');
  process.exit(1);
}
const bucketUrl = settings.endpoint ? `${settings.endpoint.replace(/\/+$/, '')}/${settings.bucket}` : `https://${settings.bucket}.s3.${settings.region}.amazonaws.com`;
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
async function signed(method, url) {
  const headers = signV4({ method, url, headers: { 'x-amz-content-sha256': EMPTY }, payloadHash: EMPTY, accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey, region: settings.region, service: 's3' });
  delete headers.host;
  return fetch(url, { method, headers });
}

const problems = [];
const expect = (ok, what) => (ok ? console.log(`ok    ${what}`) : (problems.push(what), console.log(`FAIL  ${what}`)));

const made = await signed('PUT', bucketUrl);
expect(made.ok || made.status === 409, `the bucket "${settings.bucket}" exists or was created (${made.status})`);

const SECRET = randomBytes(32).toString('hex');
const dir = mkdtempSync(join(tmpdir(), 'plugchat-s3-'));
const chat = createPlugChat({ secret: SECRET, dataDir: dir, storage: settings, log: { error() {} } });
const server = await chat.listen(0, '127.0.0.1');
const api = `http://127.0.0.1:${server.address().port}/plugchat/v1`;
const as = (sub) => ({ authorization: `Bearer ${signToken({ sub, name: sub }, SECRET, 300)}` });
try {
  await fetch(`${api}/me`, { headers: as('ama') });
  await fetch(`${api}/me`, { headers: as('kofi') });
  const dm = await (await fetch(`${api}/conversations`, { method: 'POST', headers: { ...as('ama'), 'content-type': 'application/json' }, body: JSON.stringify({ type: 'dm', memberIds: ['kofi'] }) })).json();

  const bytes = randomBytes(1_500_000); // larger than one network packet, smaller than a multipart threshold
  const up = await fetch(`${api}/conversations/${dm.id}/files`, { method: 'POST', headers: { ...as('ama'), 'content-type': 'application/pdf', 'x-filename': encodeURIComponent('minutes of the reunion.pdf') }, body: bytes });
  const file = await up.json();
  expect(up.status === 201, `a 1.5 MB upload is stored in the bucket (${up.status}${up.ok ? '' : ` ${file.message}`})`);

  const inBucket = await signed('GET', `${bucketUrl}/${settings.prefix}${file.fileId}`);
  expect(inBucket.ok && Buffer.from(await inBucket.arrayBuffer()).equals(bytes), 'the object is in the bucket under the prefix, byte for byte');

  const message = await (await fetch(`${api}/conversations/${dm.id}/messages`, { method: 'POST', headers: { ...as('ama'), 'content-type': 'application/json' }, body: JSON.stringify({ body: 'the minutes', attachment: { fileId: file.fileId } }) })).json();
  const down = await fetch(`${api}/files/${file.fileId}`, { headers: as('kofi') });
  expect(down.ok && Buffer.from(await down.arrayBuffer()).equals(bytes), 'the other member downloads the same bytes through PlugChat');
  expect((await fetch(`${api}/files/${file.fileId}`, { headers: as('esi') })).status === 404, 'someone outside the conversation cannot');

  await fetch(`${api}/messages/${message.id}`, { method: 'DELETE', headers: as('ama') });
  let gone = false;
  for (let i = 0; i < 20 && !gone; i++) {
    gone = (await signed('GET', `${bucketUrl}/${settings.prefix}${file.fileId}`)).status === 404;
    if (!gone) await new Promise((r) => setTimeout(r, 150));
  }
  expect(gone, 'deleting the message removes the object from the bucket');
} catch (e) {
  expect(false, `unexpected: ${e.message}`);
} finally {
  server.close();
  server.closeAllConnections();
  chat.close();
  rmSync(dir, { recursive: true, force: true });
}
process.exit(problems.length ? 1 : 0);
