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
} else {
  console.error('usage: plugchat <start|secret|token>');
  process.exit(1);
}
