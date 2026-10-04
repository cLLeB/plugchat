// A load test you can run on the machine you plan to deploy on.
//
//   node bench/load.mjs                 the standard run (about a minute)
//   node bench/load.mjs --quick         a smaller run, to check it works
//   node bench/load.mjs --connections=5000 --seconds=20
//
// It starts PlugChat in a separate process with a throwaway database, then
// measures, with real HTTP requests and real WebSocket connections:
//   1. how many people can be connected at once, and what that costs in memory
//   2. how many messages a second it stores and delivers, and how fast
//   3. how long a message takes to reach everyone in a large group
//   4. how fast history loads
// Results are printed and written to bench/results.json.
import { fork } from 'node:child_process';
import { cpus, totalmem, platform, release } from 'node:os';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { signToken } from '../server/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const flag = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const quick = process.argv.includes('--quick');
const CONNECTIONS = flag('connections', quick ? 300 : 2000);
const SECONDS = flag('seconds', quick ? 4 : 12);
const SENDERS = flag('senders', quick ? 20 : 64);
const GROUP = flag('group', quick ? 100 : 500);
const SECRET = 'bench-secret-bench-secret-bench-secret-0123456789';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
const summary = (times) => {
  const sorted = [...times].sort((a, b) => a - b);
  return { p50: percentile(sorted, 50), p95: percentile(sorted, 95), p99: percentile(sorted, 99) };
};
const ms = (n) => `${n.toFixed(n < 10 ? 1 : 0)} ms`;
const mb = (bytes) => `${Math.round(bytes / 1048576)} MB`;

const child = fork(join(here, 'server.mjs'), { env: { ...process.env, PLUGCHAT_SECRET: SECRET } });
const said = () => new Promise((resolve) => child.once('message', resolve));
const { port } = await said();
const stats = () => (child.send('stats'), said());
const base = `http://127.0.0.1:${port}/plugchat/v1`;
const admin = signToken({ sub: 'bench', admin: true }, SECRET, 3600);
const tokens = new Map();
const tokenFor = (id) => tokens.get(id) ?? (tokens.set(id, signToken({ sub: id, name: id }, SECRET, 3600)), tokens.get(id));
const call = async (token, method, path, body) => {
  const res = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.json();
};
/** Run `task(i)` for i in 0..count-1, `width` at a time. */
async function pool(count, width, task) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, count) }, async () => {
    while (next < count) await task(next++);
  }));
}

const idle = await stats();
console.log(`PlugChat is up (pid ${child.pid}), ${mb(idle.rss)} at rest. Creating ${CONNECTIONS} people…`);
const users = Array.from({ length: CONNECTIONS }, (_, i) => `u${i}`);
await pool(users.length, 32, (i) => call(admin, 'PUT', `/users/${users[i]}`, { name: `User ${i}` }));

// ---- 1. connections ----
const sockets = new Map();
const listeners = new Map(); // userId -> fn(event)
const openStarted = performance.now();
await pool(users.length, 64, (i) => new Promise((resolve, reject) => {
  const id = users[i];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/plugchat/v1/ws`);
  ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: tokenFor(id) })));
  ws.on('message', (raw) => {
    const event = JSON.parse(raw);
    if (event.type === 'ready') resolve();
    else listeners.get(id)?.(event);
  });
  ws.on('error', reject);
  sockets.set(id, ws);
}));
const openSeconds = (performance.now() - openStarted) / 1000;
await sleep(500);
const connected = await stats();
const perConnection = (connected.rss - idle.rss) / CONNECTIONS;
console.log(`1. ${CONNECTIONS} people connected in ${openSeconds.toFixed(1)} s. Memory ${mb(connected.rss)} (about ${Math.round(perConnection / 1024)} KB each).`);

// ---- 2. one-to-one throughput ----
// Each sender has a chat with one partner and sends as fast as answers come back.
const pairs = [];
for (let i = 0; i < SENDERS; i++) {
  const a = users[i * 2], b = users[i * 2 + 1];
  pairs.push({ a, b, id: (await call(admin, 'POST', '/conversations', { type: 'dm', memberIds: [a, b] })).id });
}
const sentAt = new Map(); // clientId -> time
const delivery = [];
for (const { b } of pairs) {
  listeners.set(b, (event) => {
    if (event.type !== 'message.new') return;
    const at = sentAt.get(event.message.clientId);
    if (at) delivery.push(performance.now() - at);
  });
}
await stats(); // reset the lag meter
const answers = [];
let sent = 0, failed = 0;
const until = performance.now() + SECONDS * 1000;
await Promise.all(pairs.map(async ({ a, id }, n) => {
  while (performance.now() < until) {
    const clientId = `c${n}-${sent++}`;
    const started = performance.now();
    sentAt.set(clientId, started);
    try {
      await call(tokenFor(a), 'POST', `/conversations/${id}/messages`, { body: 'A message of ordinary length, about sixty characters long.', clientId });
      answers.push(performance.now() - started);
    } catch {
      failed++;
    }
  }
}));
await sleep(300);
const busy = await stats();
const rate = answers.length / SECONDS;
const answered = summary(answers), delivered = summary(delivery);
console.log(`2. ${Math.round(rate)} messages a second from ${SENDERS} senders at once (${answers.length} stored, ${failed} failed, ${delivery.length} delivered).`);
console.log(`   Stored and acknowledged: half within ${ms(answered.p50)}, 95% within ${ms(answered.p95)}, 99% within ${ms(answered.p99)}.`);
console.log(`   Reached the other person: half within ${ms(delivered.p50)}, 95% within ${ms(delivered.p95)}.`);
for (const { b } of pairs) listeners.delete(b);

// ---- 3. a large group ----
const members = users.slice(0, GROUP);
const group = await call(admin, 'POST', '/conversations', { type: 'group', title: 'Everyone', memberIds: members, createdBy: members[0] });
const fanout = [];
for (let round = 0; round < 10; round++) {
  let seen = 0;
  const everyone = new Promise((resolve) => {
    for (const id of members.slice(1)) {
      listeners.set(id, (event) => {
        if (event.type === 'message.new' && event.message.conversationId === group.id && ++seen === members.length - 1) resolve();
      });
    }
  });
  const started = performance.now();
  await call(tokenFor(members[0]), 'POST', `/conversations/${group.id}/messages`, { body: `Announcement ${round}` });
  await Promise.race([everyone, sleep(10_000)]);
  fanout.push(performance.now() - started);
}
for (const id of members) listeners.delete(id);
const spread = summary(fanout);
console.log(`3. A message to a group of ${GROUP}, all connected, reached everyone in ${ms(spread.p50)} (slowest of 10: ${ms(Math.max(...fanout))}).`);

// ---- 4. history ----
const reads = [];
await pool(400, 16, async (i) => {
  const pair = pairs[i % pairs.length];
  const started = performance.now();
  await call(tokenFor(pair.a), 'GET', `/conversations/${pair.id}/messages?limit=50`);
  reads.push(performance.now() - started);
});
const read = summary(reads);
const lists = [];
await pool(200, 16, async (i) => {
  const started = performance.now();
  await call(tokenFor(members[i % members.length]), 'GET', '/conversations');
  lists.push(performance.now() - started);
});
const list = summary(lists);
console.log(`4. Loading the last 50 messages: half within ${ms(read.p50)}, 95% within ${ms(read.p95)}. Loading the chat list: 95% within ${ms(list.p95)}.`);

const end = await stats();
const results = {
  when: new Date().toISOString(),
  machine: { cpu: cpus()[0].model.trim(), cores: cpus().length, memoryGB: Math.round(totalmem() / 2 ** 30), os: `${platform()} ${release()}`, node: process.version },
  settings: { connections: CONNECTIONS, senders: SENDERS, seconds: SECONDS, group: GROUP },
  connections: { count: CONNECTIONS, secondsToOpen: +openSeconds.toFixed(2), memoryAtRestMB: Math.round(idle.rss / 1048576), memoryConnectedMB: Math.round(connected.rss / 1048576), kbPerConnection: Math.round(perConnection / 1024) },
  messaging: { perSecond: Math.round(rate), stored: answers.length, failed, acknowledgedMs: answered, deliveredMs: delivered, serverLagP99Ms: +busy.lagP99.toFixed(1), memoryMB: Math.round(busy.rss / 1048576) },
  group: { members: GROUP, reachEveryoneMs: spread, slowestMs: +Math.max(...fanout).toFixed(1) },
  history: { last50Ms: read, chatListMs: list },
  memoryAtEndMB: Math.round(end.rss / 1048576),
};
writeFileSync(join(here, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(`\nMachine: ${results.machine.cpu}, ${results.machine.cores} cores, ${results.machine.memoryGB} GB, ${results.machine.os}, Node ${results.machine.node}`);
console.log('Written to bench/results.json');

for (const ws of sockets.values()) ws.terminate();
child.send('stop');
await sleep(300);
process.exit(0);
