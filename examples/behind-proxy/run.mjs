// A whole non-Node deployment on one machine: a PHP site, PlugChat as its own
// process, and nginx in front of both. Needs `php` and `nginx` on the PATH.
//
//   node examples/behind-proxy/run.mjs           start it and leave it running at http://127.0.0.1:8088
//   node examples/behind-proxy/run.mjs --check   start it, check everything through the proxy, stop
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const check = process.argv.includes('--check');
const secret = randomBytes(48).toString('base64url');
const work = mkdtempSync(join(tmpdir(), 'plugchat-proxy-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const windows = process.platform === 'win32';
for (const tool of ['php', 'nginx']) {
  if (spawnSync(`${tool} -v`, { shell: true, stdio: 'ignore' }).status !== 0) {
    console.error(`This example needs ${tool} on the PATH.`);
    process.exit(1);
  }
}

// nginx wants its own folder with logs/ and temp/ inside it.
for (const dir of ['logs', 'temp', 'conf']) mkdirSync(join(work, dir));
cpSync(join(here, 'nginx.conf'), join(work, 'conf', 'nginx.conf'));

const children = [];
const start = (command, options) => {
  const child = spawn(command, { shell: true, detached: !windows, stdio: check ? 'ignore' : 'inherit', ...options });
  children.push(child);
  return child;
};
const stop = () => {
  spawnSync(`nginx -p "${work}" -c conf/nginx.conf -s stop`, { shell: true, stdio: 'ignore' });
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // The real server is often a grandchild (a shell, a compiler, `dotnet run`): stop the whole tree.
    if (windows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else {
      try {
        process.kill(-child.pid, 'SIGKILL'); // the process group started with detached: true
      } catch {
        child.kill('SIGKILL');
      }
    }
  }
};

// 1. PlugChat as a side service, configured only through the environment, as a non-Node platform would.
start(`node "${join(root, 'bin', 'plugchat.js')}" start`, {
  cwd: work,
  env: { ...process.env, PLUGCHAT_SECRET: secret, PORT: '4401', HOST: '127.0.0.1', PLUGCHAT_DATA: join(work, 'data'), PLUGCHAT_ORIGINS: 'http://127.0.0.1:8088', PLUGCHAT_STUDIO: 'on' },
});
// 2. The platform's own site.
start('php -S 127.0.0.1:8081 index.php', { cwd: join(here, 'site'), env: { ...process.env, PLUGCHAT_SECRET: secret } });
// 3. nginx in front of both.
start(`nginx -p "${work}" -c conf/nginx.conf`, {});

const site = 'http://127.0.0.1:8088';
for (let i = 0; i < 60; i++) {
  const up = await fetch(`${site}/plugchat/health`).then((r) => r.ok, () => false) && await fetch(site).then((r) => r.ok, () => false);
  if (up) break;
  await sleep(250);
}

if (!check) {
  console.log(`\nOpen ${site} (sign in as Ama; open a private window as Kofi). Ctrl+C stops everything.`);
  process.on('SIGINT', () => (stop(), process.exit(0)));
} else {
  const problems = [];
  const expect = (ok, what) => (ok ? console.log(`ok    ${what}`) : (problems.push(what), console.log(`FAIL  ${what}`)));
  try {
    // Sign in to the PHP site the way a browser would, and keep its cookie.
    const login = async (who) => (await fetch(`${site}/?as=${who}`, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
    const cookies = { ama: await login('ama'), kofi: await login('kofi') };
    const tokenFor = async (who) => (await (await fetch(`${site}/api/chat-token`, { headers: { cookie: cookies[who] } })).json()).token;
    const page = await (await fetch(site, { headers: { cookie: cookies.ama } })).text();
    expect(page.includes('<plug-chat server="/plugchat"'), 'the PHP site serves a page with the chat tag');
    const stranger = await fetch(`${site}/api/chat-token`);
    expect(stranger.status === 401, `the token endpoint refuses someone who is not signed in (${stranger.status})`);

    const script = await fetch(`${site}/plugchat/client/element.js`);
    expect(script.ok && script.headers.get('content-type').includes('javascript'), 'the chat\'s script loads through the proxy');

    const api = async (who, method, path, body) => {
      const res = await fetch(`${site}/plugchat/v1${path}`, { method, headers: { authorization: `Bearer ${await tokenFor(who)}`, origin: site, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, body: await res.json() };
    };
    const me = await api('ama', 'GET', '/me');
    expect(me.status === 200 && me.body.name === 'Ama Owusu', 'PlugChat accepts the token the PHP site signed');
    await api('kofi', 'GET', '/me');

    // The realtime connection, through nginx's WebSocket upgrade.
    const socket = new WebSocket('ws://127.0.0.1:8088/plugchat/v1/ws', { origin: site });
    const events = [];
    const ready = new Promise((resolve, reject) => {
      socket.on('open', async () => socket.send(JSON.stringify({ type: 'auth', token: await tokenFor('kofi') })));
      socket.on('message', (raw) => {
        const event = JSON.parse(raw);
        events.push(event);
        if (event.type === 'ready') resolve();
      });
      socket.on('error', reject);
      setTimeout(() => reject(new Error('no WebSocket through the proxy')), 5000);
    });
    await ready.then(() => expect(true, 'the WebSocket connects through nginx'), (e) => expect(false, e.message));

    const dm = await api('ama', 'POST', '/conversations', { type: 'dm', memberIds: ['kofi'] });
    const sent = await api('ama', 'POST', `/conversations/${dm.body.id}/messages`, { body: 'Hello through the proxy' });
    expect(sent.status === 201, 'a message is stored through the proxy');
    for (let i = 0; i < 30 && !events.some((e) => e.type === 'message.new'); i++) await sleep(100);
    expect(events.some((e) => e.type === 'message.new' && e.message.body === 'Hello through the proxy'), 'and reaches the other person in real time');

    const upload = await fetch(`${site}/plugchat/v1/conversations/${dm.body.id}/files`, { method: 'POST', headers: { authorization: `Bearer ${await tokenFor('ama')}`, 'content-type': 'image/png', 'x-filename': 'photo.png' }, body: new Uint8Array(3 * 1024 * 1024) });
    expect(upload.status === 201, `a 3 MB upload passes the proxy (${upload.status})`);

    const foreign = await fetch(`${site}/plugchat/v1/me`, { method: 'OPTIONS', headers: { origin: 'https://someone-else.example', 'access-control-request-method': 'GET' } });
    expect(!foreign.headers.get('access-control-allow-origin'), 'another website is not allowed to call the API');
    expect((await fetch(`${site}/plugchat/studio`)).status === 403, 'the setup studio does not answer through the proxy');
    socket.close();
  } catch (e) {
    expect(false, `unexpected: ${e.message}`);
  }
  stop();
  await sleep(300);
  process.exit(problems.length ? 1 : 0);
}
