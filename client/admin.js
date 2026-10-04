// The moderation console at /plugchat/admin, for the host platform's staff.
//
// It needs an admin token. The host's own back office opens it for a signed-in
// staff member as  /plugchat/admin#token=<short-lived admin token>  so the
// token never reaches the server in a URL. Everything is drawn with
// textContent; reported messages are shown as text, never rendered.

const base = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let token = new URLSearchParams(location.hash.slice(1)).get('token');
if (token) history.replaceState(null, '', location.pathname);

const $app = document.getElementById('app');

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter((c) => c != null && c !== false));
  return el;
}

async function api(method, path, body) {
  const res = await fetch(`${base}/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? `Request failed (${res.status})`);
  return data;
}

const when = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const bytes = (n) => (n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function signIn(message) {
  const $token = h('input', { type: 'password', placeholder: 'Admin token', 'aria-label': 'Admin token', autocomplete: 'off' });
  $app.replaceChildren(h('form', { class: 'card', onsubmit: (e) => {
    e.preventDefault();
    token = $token.value.trim();
    load();
  } },
    h('h1', {}, 'Chat moderation'),
    h('p', {}, message ?? 'Paste an admin token issued by your platform. It stays in this tab only.'),
    $token, h('button', { class: 'primary' }, 'Open console')));
}

// Run an action, then redraw. Failures are shown where the person is looking.
async function act(button, fn) {
  button.disabled = true;
  try {
    await fn();
    await load();
  } catch (e) {
    button.disabled = false;
    button.after(h('span', { class: 'error', role: 'alert' }, ` ${e.message}`));
  }
}

function userRow(user) {
  return h('li', {},
    h('div', {}, h('strong', {}, user.name), h('span', { class: 'muted' }, ` ${user.id}`),
      user.suspended && h('span', { class: 'tag' }, `Suspended: ${user.suspended}`),
      h('div', { class: 'muted' }, Object.entries(user.handles ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · '))),
    user.suspended
      ? h('button', { onclick: (e) => act(e.target, () => api('PUT', `/users/${encodeURIComponent(user.id)}/suspension`, { suspended: false })) }, 'Reinstate')
      : h('button', { class: 'danger', onclick: (e) => {
        const reason = prompt(`Why is ${user.name} being suspended? They will see this.`, 'Suspended by a moderator');
        if (reason) act(e.target, () => api('PUT', `/users/${encodeURIComponent(user.id)}/suspension`, { suspended: true, reason }));
      } }, 'Suspend'));
}

async function load() {
  if (!token) return signIn();
  let stats, reports, entries;
  try {
    [stats, { reports }, { entries }] = await Promise.all([api('GET', '/stats'), api('GET', '/reports'), api('GET', '/audit?limit=30')]);
  } catch (e) {
    return signIn(`That token was not accepted (${e.message}). Ask your platform for a fresh admin token.`);
  }

  const tile = (label, value) => h('div', { class: 'tile' }, h('strong', {}, String(value)), h('span', {}, label));
  const $results = h('ul', { class: 'list' });
  const search = async (q) => {
    const { users } = await api('GET', `/users?q=${encodeURIComponent(q)}`);
    $results.replaceChildren(...(users.length ? users.map(userRow) : [h('li', { class: 'muted' }, 'Nobody found.')]));
  };

  $app.replaceChildren(
    h('h1', {}, 'Chat moderation'),
    h('section', { class: 'tiles' },
      tile('People', stats.users), tile('Conversations', stats.conversations), tile('Messages', stats.messages),
      tile('Files stored', bytes(stats.fileBytes)), tile('Open reports', stats.openReports)),

    h('section', { class: 'card' },
      h('h2', {}, `Reports (${reports.length})`),
      reports.length === 0 && h('p', { class: 'muted' }, 'Nothing has been reported.'),
      h('ul', { class: 'list' }, reports.map((r) => {
        const m = r.message;
        const text = /^e1\./.test(m.body) ? 'End-to-end encrypted: the content cannot be read here.' : m.body || (m.attachment ? `File: ${m.attachment.name}` : '(empty)');
        return h('li', {},
          h('div', {},
            h('div', {}, h('span', { class: 'tag' }, r.reason), h('span', { class: 'muted' }, ` reported by ${r.reporterName} · ${when(r.createdAt)}`)),
            h('blockquote', {}, text),
            h('div', { class: 'muted' }, `Sent by ${r.senderName} (${m.senderId}) · ${when(m.createdAt)}${r.senderSuspended ? ' · already suspended' : ''}`)),
          h('div', { class: 'actions' },
            h('button', { class: 'danger', onclick: (e) => act(e.target, async () => {
              await api('DELETE', `/messages/${m.id}`).catch(() => {}); // it may already be gone
              await api('DELETE', `/reports/${r.id}`);
            }) }, 'Delete message'),
            !r.senderSuspended && h('button', { class: 'danger', onclick: (e) => {
              const reason = prompt(`Why is ${r.senderName} being suspended? They will see this.`, `Suspended: ${r.reason.toLowerCase()}`);
              if (reason) act(e.target, () => api('PUT', `/users/${encodeURIComponent(m.senderId)}/suspension`, { suspended: true, reason }));
            } }, 'Suspend sender'),
            h('button', { onclick: (e) => act(e.target, () => api('DELETE', `/reports/${r.id}`)) }, 'Dismiss')));
      }))),

    h('section', { class: 'card' },
      h('h2', {}, 'People'),
      h('input', { type: 'search', placeholder: 'Search by name, or exact email / phone / username', 'aria-label': 'Search people',
        oninput: (e) => search(e.target.value).catch(() => {}) }),
      $results),

    h('section', { class: 'card' },
      h('h2', {}, 'Recent staff actions'),
      entries.length === 0 && h('p', { class: 'muted' }, 'No deletions, suspensions or data exports yet.'),
      h('ul', { class: 'list' }, entries.map((e) => h('li', {},
        h('div', {}, h('code', {}, e.action), h('div', { class: 'muted' }, `${e.actor} · ${when(e.at)}`))))),
    ),
  );
  search('').catch(() => {});
}

load();
