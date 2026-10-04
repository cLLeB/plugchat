// The names platforms build on (docs/STABILITY.md). If one of these tests
// fails, something an integration may depend on was removed or renamed: that
// needs a new major version, not a quiet change. Adding names is always fine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEATURES, EVENTS } from '../server/index.js';
import { HOOK_EVENTS } from '../server/connectors.js';
import { CONFIG_KEYS } from '../server/config.js';
import { PlugChat } from '../client/plugchat.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const element = read('../client/element.js');
const styles = read('../client/styles.js');
const server = read('../server/index.js');
const missing = (names, has) => names.filter((name) => !has(name));

test('feature switches, events, hooks and settings keep their names', () => {
  assert.deepEqual(missing([
    'groups', 'directory', 'files', 'voiceNotes', 'reactions', 'replies', 'editing', 'deleting', 'forwarding', 'mentions', 'pins', 'stars', 'search',
    'polls', 'location', 'viewOnce', 'disappearing', 'scheduled', 'stories', 'calls', 'encryption', 'invites', 'reports', 'profiles', 'typing',
    'presence', 'readReceipts', 'blocking', 'export', 'personalization',
  ], (n) => FEATURES.includes(n)), []);
  assert.deepEqual(missing([
    'message.new', 'message.edited', 'message.deleted', 'message.reported', 'call.started', 'conversation.created', 'member.added', 'member.removed',
    'user.connected', 'user.disconnected',
  ], (n) => EVENTS.includes(n)), []);
  assert.deepEqual(missing(['message.before', 'conversation.before', 'upload.before', 'call.join', 'link.preview'], (n) => HOOK_EVENTS.includes(n)), []);
  assert.deepEqual(missing([
    'secret', 'previousSecrets', 'maxTokenLifetimeSeconds', 'port', 'host', 'dataDir', 'basePath', 'origins', 'webhookUrl', 'webhookEvents', 'hookUrl',
    'hookEvents', 'hookTimeoutMs', 'hookFailOpen', 'features', 'ui', 'storage', 'directory', 'stories', 'handleVisibility', 'requireEncryption',
    'iceServers', 'maxFileBytes', 'userStorageBytes', 'retentionDays', 'rateLimit', 'cluster', 'studio', 'database',
  ], (n) => CONFIG_KEYS.includes(n)), []);
  const config = read('../server/config.js');
  assert.deepEqual(missing([
    'PLUGCHAT_SECRET', 'PLUGCHAT_PREVIOUS_SECRETS', 'PLUGCHAT_MAX_TOKEN_SECONDS', 'PORT', 'HOST', 'PLUGCHAT_DATA', 'PLUGCHAT_BASE_PATH', 'PLUGCHAT_ORIGINS',
    'PLUGCHAT_WEBHOOK_URL', 'PLUGCHAT_WEBHOOK_EVENTS', 'PLUGCHAT_HOOK_URL', 'PLUGCHAT_HOOK_EVENTS', 'PLUGCHAT_HOOK_FAIL_OPEN', 'PLUGCHAT_DIRECTORY',
    'PLUGCHAT_STORIES', 'PLUGCHAT_REQUIRE_E2EE', 'PLUGCHAT_HANDLE_VISIBILITY', 'PLUGCHAT_ICE_SERVERS', 'PLUGCHAT_MAX_FILE_MB', 'PLUGCHAT_USER_STORAGE_MB',
    'PLUGCHAT_RETENTION_DAYS', 'PLUGCHAT_CLUSTER', 'PLUGCHAT_STUDIO', 'PLUGCHAT_UI', 'PLUGCHAT_DATABASE_URL', 'PLUGCHAT_FEATURES_OFF', 'PLUGCHAT_STORAGE',
    'PLUGCHAT_S3_BUCKET', 'PLUGCHAT_S3_REGION', 'PLUGCHAT_S3_ENDPOINT', 'PLUGCHAT_S3_ACCESS_KEY_ID', 'PLUGCHAT_S3_SECRET_ACCESS_KEY', 'PLUGCHAT_S3_PREFIX', 'PLUGCHAT_CONFIG',
  ], (n) => config.includes(n)), []);
  const cli = read('../bin/plugchat.js');
  assert.deepEqual(missing(['init', 'start', 'secret', 'token', 'backup', 'doctor'], (n) => cli.includes(`cmd === '${n}'`)), []);
});

test('the element keeps its attributes, properties, events, slots, part names and design tokens', () => {
  assert.deepEqual(missing([
    'server', 'token', 'token-url', 'peer', 'peer-handle', 'invite', 'heading', 'theme', 'lang', 'dir', 'layout', 'density', 'stylesheet', 'nav',
    'e2ee', 'calls', 'stories', 'history', 'notification-icon',
  ], (n) => element.includes(`'${n}'`)), []);
  assert.deepEqual(missing(['getToken', 'ui', 'features', 'css', 'strings', 'actions', 'messageActions', 'headerActions', 'renderers'], (n) => new RegExp(`this\\.${n}\\b|set ${n}\\(`).test(element)), []);
  assert.deepEqual(missing(['ready', 'unread', 'message', 'theme', 'call', 'call-join', 'invite'], (n) => element.includes(`'plugchat:${n}'`)), []);
  assert.deepEqual(missing(['sidebar-top', 'sidebar-bottom', 'thread-top', 'empty'], (n) => element.includes(`name: '${n}'`)), []);
  assert.deepEqual(missing([
    'root', 'sidebar', 'thread', 'dialog', 'toast', 'nav', 'nav-button', 'header', 'heading', 'search', 'filters', 'filter', 'stories', 'story',
    'conversation-list', 'conversation', 'badge', 'avatar', 'new-chat-button', 'messages', 'message', 'bubble', 'bubble-in', 'bubble-out', 'sender-name',
    'message-meta', 'quote', 'reactions', 'reaction', 'message-toolbar', 'seen-by', 'day-label', 'system-message', 'pinned-bar', 'typing', 'file',
    'voice-note', 'poll', 'link-preview', 'call', 'composer', 'composer-box', 'input-box', 'input', 'send-button', 'attach-menu', 'menu', 'popup',
    'button', 'icon-button', 'profile', 'settings-group',
  ], (n) => new RegExp(`['\` ]${n}['\` ]`).test(element)), []);
  assert.deepEqual(missing([
    'accent', 'accent-fg', 'bg', 'surface', 'chat', 'fg', 'muted', 'border', 'bubble', 'bubble-fg', 'bubble-out', 'bubble-out-fg', 'danger', 'online',
    'radius', 'bubble-radius', 'avatar-radius', 'control-radius', 'border-width', 'font', 'font-size', 'sidebar-width', 'height', 'pattern', 'rail',
    'field', 'link',
  ], (n) => styles.includes(`--pc-${n}:`)), []);
});

test('the REST paths, pages and the headless client keep their shape', () => {
  assert.deepEqual(missing([
    "'GET', '/v1/me'", "'PUT', '/v1/me/key'", "'PUT', '/v1/me/settings'", "'GET', '/v1/users'", "'GET', '/v1/users/lookup'", "'GET', '/v1/users/:id'",
    "'PUT', '/v1/users/:id'", "'DELETE', '/v1/users/:id'", "'GET', '/v1/me/export'", "'PUT', '/v1/blocks/:id'", "'GET', '/v1/conversations'",
    "'POST', '/v1/conversations'", "'GET', '/v1/conversations/:id'", "'PATCH', '/v1/conversations/:id'", "'PUT', '/v1/conversations/:id/settings'",
    "'POST', '/v1/conversations/:id/members'", "'DELETE', '/v1/conversations/:id/members/:uid'", "'GET', '/v1/conversations/:id/messages'",
    "'POST', '/v1/conversations/:id/messages'", "'POST', '/v1/conversations/:id/read'", "'POST', '/v1/conversations/:id/files'", "'GET', '/v1/files/:id'",
    "'PATCH', '/v1/messages/:id'", "'DELETE', '/v1/messages/:id'", "'PUT', '/v1/messages/:id/reactions/:emoji'", "'PUT', '/v1/messages/:id/pin'",
    "'PUT', '/v1/messages/:id/star'", "'PUT', '/v1/messages/:id/vote'", "'POST', '/v1/messages/:id/open'", "'POST', '/v1/messages/:id/report'",
    "'POST', '/v1/conversations/:id/calls'", "'POST', '/v1/calls/:id/join'", "'GET', '/v1/search'", "'GET', '/v1/stories'", "'POST', '/v1/stories'",
    "'POST', '/v1/conversations/:id/invites'", "'POST', '/v1/invites/:code/join'", "'PUT', '/v1/users/:id/suspension'", "'POST', '/v1/users/:id/notify'",
    "'GET', '/v1/users/:id/unread'", "'GET', '/v1/reports'", "'GET', '/v1/stats'", "'GET', '/v1/audit'",
  ], (n) => server.includes(`[${n}`)), []);
  assert.deepEqual(missing(["'/health'", "'/embed'", "'/admin'", "'/studio'", "'/client/'"], (n) => server.includes(n)), []);
  assert.deepEqual(missing([
    'connect', 'close', 'on', 'conversations', 'openDm', 'openDmByHandle', 'createGroup', 'messages', 'send', 'sendPoll', 'sendLocation', 'sendCustom',
    'schedule', 'forward', 'edit', 'remove', 'react', 'unreact', 'vote', 'pin', 'unpin', 'star', 'unstar', 'open', 'report', 'search', 'read', 'typing',
    'download', 'user', 'searchUsers', 'block', 'unblock', 'settings', 'update', 'addMembers', 'removeMember', 'leave', 'stories', 'postStory',
    'createInvite', 'joinByInvite', 'startCall', 'joinCall', 'setAvatar', 'setAbout', 'avatarUrl', 'exportMyData',
  ], (n) => typeof PlugChat.prototype[n] === 'function'), []);
});
