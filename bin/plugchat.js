#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { createPlugChat, signToken } from '../server/index.js';
import { loadConfig, review } from '../server/config.js';

const [cmd = 'start', ...args] = process.argv.slice(2);
const env = process.env;

/** Settings from plugchat.config.json and the environment, or a clear message about what is wrong with them. */
function settings() {
  try {
    return loadConfig();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

const requireSecret = () => {
  const { secret } = settings().options;
  if (!secret) {
    console.error('Set PLUGCHAT_SECRET first. Generate one with: plugchat secret');
    process.exit(1);
  }
  return secret;
};

if (cmd === 'secret') {
  console.log(randomBytes(48).toString('base64url'));
} else if (cmd === 'init') {
  // plugchat init [--studio]   — writes a starting plugchat.config.json and a .env with a fresh secret
  const { existsSync, writeFileSync, appendFileSync, readFileSync } = await import('node:fs');
  const wrote = [];
  if (existsSync('plugchat.config.json')) console.log('plugchat.config.json already exists; left as it is.');
  else {
    writeFileSync('plugchat.config.json', JSON.stringify({
      port: 4400,
      dataDir: './plugchat-data',
      origins: ['http://localhost:3000'],
      webhookUrl: '',
      webhookEvents: ['message.new', 'message.reported', 'call.started'],
      features: { stories: true, polls: true, calls: true },
      ui: { theme: { accent: '#2f6fed' }, layout: 'bubbles' },
      studio: true,
    }, null, 2) + '\n');
    wrote.push('plugchat.config.json');
  }
  const hasSecret = env.PLUGCHAT_SECRET || (existsSync('.env') && /^PLUGCHAT_SECRET=/m.test(readFileSync('.env', 'utf8')));
  if (hasSecret) console.log('A PLUGCHAT_SECRET is already set; left as it is.');
  else {
    appendFileSync('.env', `${existsSync('.env') && !readFileSync('.env', 'utf8').endsWith('\n') ? '\n' : ''}PLUGCHAT_SECRET=${randomBytes(48).toString('base64url')}\n`);
    wrote.push('.env (keep it out of version control)');
  }
  if (wrote.length) console.log(`Wrote ${wrote.join(' and ')}.`);
  console.log(`
Next:
  1. Give your backend the same PLUGCHAT_SECRET, and add the token endpoint.
     Ready-made versions for Node, Python, PHP, Go, Ruby, Java and C# are in the starters folder.
  2. Start it:        plugchat start
  3. Shape the look:  open http://localhost:4400/plugchat/studio  (pick colours, layout and features; copy the code)
  4. Before going live: set "origins" to your real site, set "studio" to false, and run: plugchat doctor`);
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
  const { options, port, host, file } = settings();
  requireSecret();
  let chat;
  try {
    chat = createPlugChat(options);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const server = await chat.listen(port, host);
  console.log(`PlugChat listening on http://localhost:${port}${chat.basePath}${file ? ` (settings from ${file})` : ''}`);
  if (!options.origins || options.origins === '*') console.log('Note: origins is not set, so any website may call this API with a valid token.');
  if (options.studio) console.log(`Setup studio: http://localhost:${port}${chat.basePath}/studio (switch it off in production)`);
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
  const { dataDir } = settings().options;
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

  let loaded;
  try {
    loaded = loadConfig();
    say('ok', loaded.file ? `Settings read from ${loaded.file} and the environment` : 'Settings read from the environment (no plugchat.config.json)');
  } catch (e) {
    say('FAIL', e.message);
  }
  if (loaded) {
    const { options, port } = loaded;
    try {
      mkdirSync(options.dataDir, { recursive: true });
      accessSync(options.dataDir, constants.W_OK);
      say('ok', `Data folder ${options.dataDir} is writable`);
    } catch {
      say('FAIL', `Data folder ${options.dataDir} cannot be written to`);
    }
    for (const [level, text] of review(options, { port })) say(level, text);
  }

  console.log(failed ? '\nNot ready: fix the FAIL lines above.' : '\nReady to start.');
  process.exit(failed ? 1 : 0);
} else {
  console.error('usage: plugchat <init|start|secret|token|backup|doctor>');
  process.exit(1);
}
