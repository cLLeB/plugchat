// Runs every starter whose language is installed on this machine against a
// real PlugChat and checks the two things an integration depends on:
//   1. the token it issues is accepted by PlugChat as the right person
//   2. it accepts a genuine PlugChat webhook and refuses a forged one
//   3. its hook lets an ordinary message through and vetoes one its rule refuses
//
//   node starters/verify.mjs            every starter that can run here
//   node starters/verify.mjs python go  only these (and fail if they cannot run)
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlugChat } from '../server/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const starters = JSON.parse(readFileSync(join(here, 'starters.json'), 'utf8'));
const wanted = process.argv.slice(2);
const SECRET = 'starter-check-secret-starter-check-secret-0123456789';
const windows = process.platform === 'win32';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One command line through the shell, so launchers such as python.exe shims and .cmd files are found on Windows.
const installed = (command) => spawnSync(command.join(' '), { stdio: 'ignore', shell: true }).status === 0;

function stop(child) {
  if (child.exitCode !== null) return;
  // Compilers and `dotnet run` start the real server as a child process: stop the whole tree.
  if (windows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGKILL');
}

async function check(starter, port) {
  const base = `http://127.0.0.1:${port}`;
  const dir = mkdtempSync(join(tmpdir(), 'plugchat-starter-'));
  const chat = createPlugChat({ secret: SECRET, dataDir: dir, log: { error() {} }, webhookUrl: `${base}/webhooks/plugchat`, webhookRetryBaseMs: 200, hookUrl: `${base}/hooks/plugchat`, hookEvents: ['message.before'] });
  const server = await chat.listen(0);
  const api = `http://127.0.0.1:${server.address().port}/plugchat/v1`;
  const command = starter.run.join(' ').replace('{port}', String(port));
  let output = '';
  const child = spawn(command, { cwd: join(here, dirname(starter.file)), env: { ...process.env, PLUGCHAT_SECRET: SECRET, PORT: String(port) }, shell: true });
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  try {
    // Wait for it to come up (compiled languages take a while the first time).
    let token;
    for (let i = 0; i < 240 && !token; i++) {
      if (child.exitCode !== null) throw new Error(`exited early:\n${output}`);
      token = await fetch(`${base}/api/chat-token`).then((r) => r.json()).then((j) => j.token, () => null);
      if (!token) await sleep(500);
    }
    if (!token) throw new Error(`did not answer on ${base}/api/chat-token\n${output}`);

    const me = await fetch(`${api}/me`, { headers: { authorization: `Bearer ${token}` } });
    if (me.status !== 200) throw new Error(`PlugChat refused the token (${me.status}): ${await me.text()}`);
    const who = await me.json();
    if (who.id !== 'demo-user' || who.name !== 'Demo User') throw new Error(`token identifies ${who.id} / ${who.name}`);

    // A genuine webhook, delivered by PlugChat itself: it stays queued until the starter answers 2xx.
    await chat.admin.upsertUser('other', { name: 'Other' });
    const dm = await chat.admin.openDm('demo-user', 'other');
    await chat.admin.post(dm.id, { kind: 'text', senderId: 'other', body: 'hello' });
    const queued = () => chat.store.get('SELECT COUNT(*) AS n FROM webhook_queue').n;
    for (let i = 0; i < 50 && queued() > 0; i++) await sleep(200);
    if (queued() > 0) throw new Error('did not accept a genuine webhook');

    const forged = await fetch(`${base}/webhooks/plugchat`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-plugchat-signature': `sha256=${'0'.repeat(64)}` }, body: '{"type":"message.new"}' });
    if (forged.status !== 401) throw new Error(`accepted a forged webhook (${forged.status})`);
    const unsigned = await fetch(`${base}/webhooks/plugchat`, { method: 'POST', body: '{"type":"message.new"}' });
    if (unsigned.status !== 401) throw new Error(`accepted an unsigned webhook (${unsigned.status})`);

    // The hook: PlugChat asks the starter before storing what a person sends.
    const say = (body) => fetch(`${api}/conversations/${dm.id}/messages`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ body }) });
    const fine = await say('an ordinary message');
    if (fine.status !== 201) throw new Error(`the hook stopped an ordinary message (${fine.status}): ${await fine.text()}`);
    const refused = await say('this one is [blocked]');
    const why = await refused.json();
    if (refused.status === 201 || !/not allowed here/.test(why.message ?? '')) throw new Error(`the hook did not veto a message its rule refuses (${refused.status})`);
    const forgedHook = await fetch(`${base}/hooks/plugchat`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-plugchat-signature': `sha256=${'0'.repeat(64)}` }, body: '{"event":"message.before","message":{"body":"x"}}' });
    if (forgedHook.status !== 401) throw new Error(`answered a forged hook request (${forgedHook.status})`);
  } finally {
    stop(child);
    server.close();
    server.closeAllConnections();
    chat.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

let failed = false;
let port = 8600;
for (const starter of starters) {
  if (wanted.length && !wanted.includes(starter.id)) continue;
  if (!installed(starter.check)) {
    console.log(`${wanted.length ? 'FAIL' : 'skip'}  ${starter.name.padEnd(12)} ${starter.check[0]} is not installed on this machine`);
    failed ||= wanted.length > 0;
    continue;
  }
  try {
    await check(starter, port++);
    console.log(`ok    ${starter.name.padEnd(12)} token accepted; webhook accepted, forged and unsigned refused; hook passes and vetoes`);
  } catch (e) {
    failed = true;
    console.log(`FAIL  ${starter.name.padEnd(12)} ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
