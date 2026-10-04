// Settings for running PlugChat as its own process, for platforms whose
// backend is not Node. Everything the Node `createPlugChat(options)` call
// accepts as plain data can be set here, in two layers:
//
//   1. a config file: ./plugchat.config.json, or the path in PLUGCHAT_CONFIG
//   2. environment variables, which win over the file (handy for secrets and per-environment values)
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FEATURES, EVENTS } from './index.js';

// Keys a config file may contain. Functions (hooks, plugins, custom adapters) need the Node API instead.
export const CONFIG_KEYS = [
  'secret', 'previousSecrets', 'maxTokenLifetimeSeconds', 'port', 'host', 'dataDir', 'basePath', 'origins',
  'webhookUrl', 'webhookEvents', 'hookUrl', 'hookEvents', 'hookTimeoutMs', 'hookFailOpen',
  'features', 'ui', 'storage', 'directory', 'stories', 'handleVisibility', 'requireEncryption', 'iceServers',
  'maxFileBytes', 'userStorageBytes', 'retentionDays', 'rateLimit', 'cluster', 'studio', 'database',
];

const list = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);
const on = (value) => value === 'on' || value === 'true' || value === '1';
const off = (value) => value === 'off' || value === 'false' || value === '0';

/** What each environment variable sets. Returning undefined leaves the config file's value alone. */
const ENV = {
  PLUGCHAT_SECRET: (v) => ({ secret: v }),
  PLUGCHAT_PREVIOUS_SECRETS: (v) => ({ previousSecrets: list(v) }),
  PLUGCHAT_MAX_TOKEN_SECONDS: (v) => ({ maxTokenLifetimeSeconds: Number(v) }),
  PORT: (v) => ({ port: Number(v) }),
  HOST: (v) => ({ host: v }),
  PLUGCHAT_DATA: (v) => ({ dataDir: v }),
  PLUGCHAT_BASE_PATH: (v) => ({ basePath: v }),
  PLUGCHAT_ORIGINS: (v) => ({ origins: v === '*' ? '*' : list(v) }),
  PLUGCHAT_WEBHOOK_URL: (v) => ({ webhookUrl: v }),
  PLUGCHAT_WEBHOOK_EVENTS: (v) => ({ webhookEvents: list(v) }),
  PLUGCHAT_HOOK_URL: (v) => ({ hookUrl: v }),
  PLUGCHAT_HOOK_EVENTS: (v) => ({ hookEvents: list(v) }),
  PLUGCHAT_HOOK_FAIL_OPEN: (v) => ({ hookFailOpen: on(v) }),
  PLUGCHAT_DIRECTORY: (v) => ({ directory: !off(v) }),
  PLUGCHAT_STORIES: (v) => ({ stories: !off(v) }),
  PLUGCHAT_REQUIRE_E2EE: (v) => ({ requireEncryption: on(v) }),
  PLUGCHAT_HANDLE_VISIBILITY: (v) => ({ handleVisibility: v === 'all' ? 'all' : 'none' }),
  PLUGCHAT_ICE_SERVERS: (v) => ({ iceServers: JSON.parse(v) }),
  PLUGCHAT_MAX_FILE_MB: (v) => ({ maxFileBytes: Number(v) * 1024 * 1024 }),
  PLUGCHAT_USER_STORAGE_MB: (v) => ({ userStorageBytes: Number(v) * 1024 * 1024 }),
  PLUGCHAT_RETENTION_DAYS: (v) => ({ retentionDays: Number(v) }),
  PLUGCHAT_CLUSTER: (v) => ({ cluster: on(v) }),
  PLUGCHAT_STUDIO: (v) => ({ studio: v === 'remote' ? 'remote' : on(v) || v === 'local' }),
  PLUGCHAT_UI: (v) => ({ ui: JSON.parse(v) }),
  PLUGCHAT_DATABASE_URL: (v) => ({ database: v }),
};

/**
 * Read the config file and the environment.
 * @returns {{ options: object, port: number, host: string|undefined, file: string|null }}
 */
export function loadConfig({ env = process.env, cwd = process.cwd(), file } = {}) {
  // A .env file beside the config (what `plugchat init` writes) fills in what the real environment does not set.
  const dotenv = resolve(cwd, '.env');
  if (existsSync(dotenv)) {
    const fromFile = {};
    for (const line of readFileSync(dotenv, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (match) fromFile[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
    env = { ...fromFile, ...env };
  }
  const path = file ?? env.PLUGCHAT_CONFIG ?? (existsSync(resolve(cwd, 'plugchat.config.json')) ? 'plugchat.config.json' : null);
  let config = {};
  if (path) {
    const full = resolve(cwd, path);
    if (!existsSync(full)) throw new Error(`Config file not found: ${full}`);
    try {
      config = JSON.parse(readFileSync(full, 'utf8'));
    } catch (e) {
      throw new Error(`${full} is not valid JSON: ${e.message}`);
    }
    const unknown = Object.keys(config).filter((key) => !CONFIG_KEYS.includes(key) && !key.startsWith('$'));
    if (unknown.length) throw new Error(`${full} has settings PlugChat does not know: ${unknown.join(', ')}. Known settings: ${CONFIG_KEYS.join(', ')}`);
  }

  for (const [name, read] of Object.entries(ENV)) {
    if (env[name] === undefined || env[name] === '') continue;
    try {
      Object.assign(config, read(env[name]));
    } catch (e) {
      throw new Error(`${name} could not be read: ${e.message}`);
    }
  }

  // PLUGCHAT_FEATURES_OFF=stories,polls switches features off on top of the file's choices.
  if (env.PLUGCHAT_FEATURES_OFF) {
    config.features = { ...config.features, ...Object.fromEntries(list(env.PLUGCHAT_FEATURES_OFF).map((name) => [name, false])) };
  }
  // PLUGCHAT_STORAGE=s3 with PLUGCHAT_S3_* keeps uploads in the platform's own bucket.
  if (env.PLUGCHAT_STORAGE === 's3' || (!env.PLUGCHAT_STORAGE && env.PLUGCHAT_S3_BUCKET)) {
    const storage = { ...(config.storage?.type === 's3' ? config.storage : {}), type: 's3' };
    const names = { bucket: 'PLUGCHAT_S3_BUCKET', region: 'PLUGCHAT_S3_REGION', endpoint: 'PLUGCHAT_S3_ENDPOINT', accessKeyId: 'PLUGCHAT_S3_ACCESS_KEY_ID', secretAccessKey: 'PLUGCHAT_S3_SECRET_ACCESS_KEY', prefix: 'PLUGCHAT_S3_PREFIX' };
    for (const [key, name] of Object.entries(names)) if (env[name]) storage[key] = env[name];
    config.storage = storage;
  } else if (env.PLUGCHAT_STORAGE === 'disk') {
    config.storage = { type: 'disk' };
  }

  const { port = 4400, host, ...options } = config;
  options.dataDir ??= './plugchat-data';
  return { options, port, host, file: path };
}

/** Problems a person should fix before going live, as [level, text] pairs: 'FAIL', 'warn' or 'ok'. */
export function review(options, { port } = {}) {
  const out = [];
  const say = (level, text) => out.push([level, text]);
  const secret = options.secret ?? '';
  if (!secret) say('FAIL', 'No secret is set. Generate one with: plugchat secret (then set PLUGCHAT_SECRET)');
  else if (secret.length < 32) say('FAIL', `The secret is ${secret.length} characters; it must be at least 32`);
  else say('ok', 'A secret is set');

  if (!options.origins || options.origins === '*') say('warn', 'origins is not set: any website may call the API with a valid token, and any site may frame the embed page');
  else {
    const bad = options.origins.filter((o) => !/^https?:\/\/[^/]+$/.test(o));
    say(bad.length ? 'FAIL' : 'ok', bad.length ? `origins entries must look like https://example.com (no path): ${bad.join(', ')}` : `origins: ${options.origins.join(', ')}`);
  }

  for (const key of ['webhookUrl', 'hookUrl']) {
    if (!options[key]) continue;
    let target;
    try {
      target = new URL(options[key]);
    } catch {
      say('FAIL', `${key} is not a valid URL`);
      continue;
    }
    const safe = target.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
    say(safe ? 'ok' : 'warn', `${key} → ${target.origin}${safe ? '' : ' (not HTTPS: message content would cross the network unencrypted)'}`);
  }
  if (options.hookUrl && !options.hookEvents?.length) say('warn', 'hookUrl is set but hookEvents is empty, so no hooks will be called');
  if (options.hookFailOpen) say('warn', 'hookFailOpen is on: if your hook endpoint is down, messages go through unchecked');
  if (!options.webhookUrl) say('warn', 'webhookUrl is not set: people who are offline will not be notified of new messages');

  const unknownFeatures = Object.keys(options.features ?? {}).filter((name) => !FEATURES.includes(name));
  if (unknownFeatures.length) say('FAIL', `Unknown features: ${unknownFeatures.join(', ')}`);
  const offNow = Object.entries(options.features ?? {}).filter(([, v]) => v === false).map(([k]) => k);
  if (offNow.length) say('ok', `Switched off: ${offNow.join(', ')}`);
  const unknownEvents = (options.webhookEvents ?? []).filter((name) => !EVENTS.includes(name));
  if (unknownEvents.length) say('FAIL', `Unknown webhook events: ${unknownEvents.join(', ')}`);

  if (options.storage?.type === 's3') {
    const missing = ['bucket', 'accessKeyId', 'secretAccessKey'].filter((key) => !options.storage[key]);
    say(missing.length ? 'FAIL' : 'ok', missing.length ? `S3 storage is missing: ${missing.join(', ')}` : `Uploads go to the bucket "${options.storage.bucket}"`);
  }
  if (options.studio) say('warn', `The setup studio is on${options.studio === 'remote' ? ' and reachable from other machines' : ''}: it can sign in as test users. Switch it off in production.`);
  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) say('FAIL', `port ${port} is not a valid port`);
  return out;
}
