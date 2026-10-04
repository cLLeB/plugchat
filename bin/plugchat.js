#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { createPlugChat, signToken } from '../server/index.js';

const [cmd = 'start', ...args] = process.argv.slice(2);
const env = process.env;

const requireSecret = () => {
  if (!env.PLUGCHAT_SECRET) {
    console.error('Set PLUGCHAT_SECRET first. Generate one with: plugchat secret');
    process.exit(1);
  }
  return env.PLUGCHAT_SECRET;
};

if (cmd === 'secret') {
  console.log(randomBytes(48).toString('base64url'));
} else if (cmd === 'token') {
  // plugchat token <userId> [display name] [--admin]
  const admin = args.includes('--admin');
  const [sub, name] = args.filter((a) => a !== '--admin');
  if (!sub) {
    console.error('usage: plugchat token <userId> [name] [--admin]');
    process.exit(1);
  }
  console.log(signToken(admin ? { sub, admin: true } : { sub, name }, requireSecret(), 3600));
} else if (cmd === 'start') {
  const port = Number(env.PORT ?? 4400);
  const chat = createPlugChat({
    secret: requireSecret(),
    dataDir: env.PLUGCHAT_DATA ?? './plugchat-data',
    basePath: env.PLUGCHAT_BASE_PATH ?? '/plugchat',
    origins: env.PLUGCHAT_ORIGINS ? env.PLUGCHAT_ORIGINS.split(',').map((s) => s.trim()) : '*',
    webhookUrl: env.PLUGCHAT_WEBHOOK_URL,
    directory: env.PLUGCHAT_DIRECTORY !== 'off',
    stories: env.PLUGCHAT_STORIES !== 'off',
    cluster: env.PLUGCHAT_CLUSTER === 'on',
    retentionDays: env.PLUGCHAT_RETENTION_DAYS ? Number(env.PLUGCHAT_RETENTION_DAYS) : 0,
    userStorageBytes: env.PLUGCHAT_USER_STORAGE_MB ? Number(env.PLUGCHAT_USER_STORAGE_MB) * 1024 * 1024 : 0,
    previousSecrets: env.PLUGCHAT_PREVIOUS_SECRETS ? env.PLUGCHAT_PREVIOUS_SECRETS.split(',') : [],
    maxTokenLifetimeSeconds: env.PLUGCHAT_MAX_TOKEN_SECONDS ? Number(env.PLUGCHAT_MAX_TOKEN_SECONDS) : undefined,
    hookUrl: env.PLUGCHAT_HOOK_URL,
    hookEvents: env.PLUGCHAT_HOOK_EVENTS ? env.PLUGCHAT_HOOK_EVENTS.split(',').map((s) => s.trim()) : [],
    hookFailOpen: env.PLUGCHAT_HOOK_FAIL_OPEN === 'on',
    requireEncryption: env.PLUGCHAT_REQUIRE_E2EE === 'on',
    handleVisibility: env.PLUGCHAT_HANDLE_VISIBILITY === 'all' ? 'all' : 'none',
    iceServers: env.PLUGCHAT_ICE_SERVERS ? JSON.parse(env.PLUGCHAT_ICE_SERVERS) : undefined,
    maxFileBytes: env.PLUGCHAT_MAX_FILE_MB ? Number(env.PLUGCHAT_MAX_FILE_MB) * 1024 * 1024 : undefined,
  });
  const server = await chat.listen(port, env.HOST);
  console.log(`PlugChat listening on http://localhost:${port}${chat.basePath}`);
  if (!env.PLUGCHAT_ORIGINS) console.log('Note: PLUGCHAT_ORIGINS is not set, so any website may call this API with a valid token.');
  const stop = () => {
    server.close();
    chat.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} else if (cmd === 'backup') {
  // plugchat backup <destination folder>   (safe to run while the server is up)
  const { Store } = await import('../server/store.js');
  const { cpSync, existsSync, mkdirSync } = await import('node:fs');
  const { join, resolve } = await import('node:path');
  const dataDir = env.PLUGCHAT_DATA ?? './plugchat-data';
  const dest = args[0] && resolve(args[0]);
  if (!dest || !existsSync(join(dataDir, 'plugchat.db'))) {
    console.error(dest ? `No database found in ${resolve(dataDir)} (set PLUGCHAT_DATA).` : 'usage: plugchat backup <destination folder>');
    process.exit(1);
  }
  if (existsSync(join(dest, 'plugchat.db'))) {
    console.error(`${dest} already holds a backup. Choose an empty folder so nothing is overwritten.`);
    process.exit(1);
  }
  mkdirSync(dest, { recursive: true });
  const store = new Store(join(dataDir, 'plugchat.db'));
  store.backupTo(join(dest, 'plugchat.db'));
  store.close();
  if (existsSync(join(dataDir, 'files'))) cpSync(join(dataDir, 'files'), join(dest, 'files'), { recursive: true });
  console.log(`Backup written to ${dest}. To restore, stop PlugChat and point PLUGCHAT_DATA at a copy of that folder.`);
} else if (cmd === 'doctor') {
  // plugchat doctor   — checks the configuration before going live
  const { accessSync, constants, mkdirSync } = await import('node:fs');
  let failed = false;
  const say = (level, text) => {
    if (level === 'FAIL') failed = true;
    console.log(`${level.padEnd(4)} ${text}`);
  };
  const [major, minor] = process.versions.node.split('.').map(Number);
  say(major > 22 || (major === 22 && minor >= 13) ? 'ok' : 'FAIL', `Node.js ${process.versions.node} (22.13 or newer is required)`);

  const secret = env.PLUGCHAT_SECRET ?? '';
  if (!secret) say('FAIL', 'PLUGCHAT_SECRET is not set. Generate one with: plugchat secret');
  else if (secret.length < 32) say('FAIL', `PLUGCHAT_SECRET is ${secret.length} characters; it must be at least 32`);
  else say('ok', 'PLUGCHAT_SECRET is set');

  const dataDir = env.PLUGCHAT_DATA ?? './plugchat-data';
  try {
    mkdirSync(dataDir, { recursive: true });
    accessSync(dataDir, constants.W_OK);
    say('ok', `Data folder ${dataDir} is writable`);
  } catch {
    say('FAIL', `Data folder ${dataDir} cannot be written to`);
  }

  if (!env.PLUGCHAT_ORIGINS) say('warn', 'PLUGCHAT_ORIGINS is not set: any website may call the API with a valid token, and any site may frame the embed page');
  else {
    const bad = env.PLUGCHAT_ORIGINS.split(',').map((s) => s.trim()).filter((o) => !/^https?:\/\/[^/]+$/.test(o));
    say(bad.length ? 'FAIL' : 'ok', bad.length ? `PLUGCHAT_ORIGINS entries must look like https://example.com (no path): ${bad.join(', ')}` : 'PLUGCHAT_ORIGINS is set');
  }

  for (const name of ['PLUGCHAT_WEBHOOK_URL', 'PLUGCHAT_HOOK_URL']) {
    if (!env[name]) continue;
    let target;
    try {
      target = new URL(env[name]);
    } catch {
      say('FAIL', `${name} is not a valid URL`);
      continue;
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
    say(target.protocol === 'https:' || local ? 'ok' : 'warn', `${name} → ${target.origin}${target.protocol === 'https:' || local ? '' : ' (not HTTPS: message content would cross the network unencrypted)'}`);
  }
  if (env.PLUGCHAT_HOOK_URL && !env.PLUGCHAT_HOOK_EVENTS) say('warn', 'PLUGCHAT_HOOK_URL is set but PLUGCHAT_HOOK_EVENTS is empty, so no hooks will be called');
  if (env.PLUGCHAT_HOOK_FAIL_OPEN === 'on') say('warn', 'PLUGCHAT_HOOK_FAIL_OPEN is on: if your hook endpoint is down, messages go through unchecked');
  if (!env.PLUGCHAT_WEBHOOK_URL) say('warn', 'PLUGCHAT_WEBHOOK_URL is not set: people who are offline will not be notified of new messages');

  console.log(failed ? '\nNot ready: fix the FAIL lines above.' : '\nReady to start.');
  process.exit(failed ? 1 : 0);
} else {
  console.error('usage: plugchat <start|secret|token|backup|doctor>');
  process.exit(1);
}
