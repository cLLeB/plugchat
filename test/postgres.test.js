// PostgreSQL as the database. The translation test always runs. The rest needs
// a server and is skipped without one:
//
//   PLUGCHAT_TEST_DATABASE=postgres://user:password@localhost:5432/dbname npm run test:postgres
//
// which also runs every other test in the suite against PostgreSQL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlugChat, signToken } from '../server/index.js';
import { toPostgres } from '../server/postgres.js';
import { PlugChat } from '../client/plugchat.js';

const SECRET = 'test-secret-test-secret-test-secret-0123456789';
const url = process.env.PLUGCHAT_TEST_DATABASE;

test('statements are rewritten from the shared dialect to PostgreSQL', () => {
  assert.equal(toPostgres('SELECT * FROM users WHERE id = ? AND name LIKE ?'), 'SELECT * FROM users WHERE id = $1 AND name ILIKE $2');
  assert.equal(toPostgres('INSERT OR IGNORE INTO blocks (user_id, blocked_id) VALUES (?, ?)'), 'INSERT INTO blocks (user_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING');
  assert.equal(toPostgres("UPDATE messages SET body = 'really?' WHERE id = ?"), "UPDATE messages SET body = 'really?' WHERE id = $1", 'a ? inside a string is left alone');
  assert.equal(toPostgres('SELECT device_id FROM devices ORDER BY last_seen DESC LIMIT -1 OFFSET ?'), 'SELECT device_id FROM devices ORDER BY last_seen DESC OFFSET $1');
  assert.equal(toPostgres('UPDATE members SET last_read_seq = MIN(?, (SELECT 1))'), 'UPDATE members SET last_read_seq = LEAST($1, (SELECT 1))');
  assert.equal(toPostgres('INSERT INTO webhook_queue (body, attempts, next_at) VALUES (?, 0, 0)'), 'INSERT INTO webhook_queue (body, attempts, next_at) VALUES ($1, 0, 0) RETURNING id');
  assert.equal(toPostgres('CREATE TABLE bus (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL)'), 'CREATE TABLE bus (id BIGSERIAL PRIMARY KEY, at BIGINT NOT NULL)');
  assert.equal(toPostgres('BEGIN IMMEDIATE'), 'BEGIN');
});

test('a platform can keep its chat data in its own PostgreSQL, shared by instances that share nothing else', { skip: !url && 'set PLUGCHAT_TEST_DATABASE to run' }, async () => {
  const schema = `pc_${Date.now().toString(36)}`;
  // Two instances as on two machines: separate data folders, the same database.
  const dirs = [mkdtempSync(join(tmpdir(), 'plugchat-pg-a-')), mkdtempSync(join(tmpdir(), 'plugchat-pg-b-'))];
  const [one, two] = dirs.map((dataDir) => createPlugChat({ secret: SECRET, dataDir, database: { url, schema }, cluster: true, log: { error() {} }, rateLimit: { perSecond: 1000, burst: 1000 } }));
  assert.equal(one.store.postgres, true);
  const servers = [await one.listen(0), await two.listen(0)];
  const address = (i) => `http://localhost:${servers[i].address().port}/plugchat`;
  const client = async (i, sub) => {
    const c = new PlugChat({ url: address(i), getToken: async () => signToken({ sub, name: sub }, SECRET) });
    await c.connect();
    return c;
  };
  const ama = await client(0, 'ama');
  const kofi = await client(1, 'kofi');
  try {
    const dm = await ama.openDm('kofi');
    const arrived = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the message did not cross instances')), 4000);
      kofi.on('message', (m) => (clearTimeout(timer), resolve(m)));
    });
    await ama.send(dm.id, { text: 'Hello from the other machine' });
    assert.equal((await arrived).text, 'Hello from the other machine');

    // Written through one instance, read through the other.
    const seen = await kofi.messages(dm.id);
    assert.deepEqual(seen.map((m) => m.text), ['Hello from the other machine']);
    assert.equal(typeof seen[0].createdAt, 'number', 'timestamps come back as numbers');
    assert.equal((await kofi.search('OTHER MACHINE')).length, 1, 'search ignores case, as it does on SQLite');
    assert.equal((await two.admin.stats()).messages, 1);

    assert.throws(() => createPlugChat({ secret: SECRET, dataDir: dirs[0], database: { url: 'postgres://nobody:wrong@127.0.0.1:1/none' } }), /PlugChat database|did not answer/);
  } finally {
    ama.close();
    kofi.close();
    one.store.db.exec(`DROP SCHEMA "${schema}" CASCADE`);
    for (const server of servers) (server.close(), server.closeAllConnections());
    one.close();
    two.close();
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }
});
