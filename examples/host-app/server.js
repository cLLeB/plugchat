// A stand-in for "your existing platform": a members' association site with
// its own users and its own sign-in. The only chat-specific code it needs is
// the /api/chat-token endpoint and the <plug-chat> tag in the page.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPlugChat } from '../../server/index.js';

const vendorCalls = process.argv.includes('--vendor-calls');
const portArg = process.argv.find((a) => a.startsWith('--port='))?.slice(7);
const here = (f) => fileURLToPath(new URL(f, import.meta.url));

// The association's existing member database.
// Different platforms know their people by different things; this one has a
// mix, and PlugChat can find a member by any of them.
const MEMBERS = {
  ama: { name: 'Ama Owusu', email: 'ama@alumni.example' },
  kofi: { name: 'Kofi Mensah', phone: '+233 24 555 0101' },
  esi: { name: 'Esi Appiah', username: 'esi_a' },
  yaw: { name: 'Yaw Boateng', handles: { member_no: 'AA-0042' } },
};
const STAFF = new Set(['ama']); // who may open the moderation console
// Demo only: one password for everyone, printed on the sign-in page. A real platform has its own accounts.
const DEMO_PASSWORD = 'reunion-2026';

const chat = createPlugChat({
  // Demo only: a real host keeps one fixed secret in its environment.
  secret: process.env.PLUGCHAT_SECRET ?? randomBytes(48).toString('base64url'),
  dataDir: here(vendorCalls ? './data-vendor' : './data'),
  // The developer's workbench at /plugchat/studio. It only answers this machine; leave it off in production.
  studio: true,
  // Where the chat's own Privacy page links for the association's policy.
  ui: { privacyUrl: '/privacy' },
  // A plugin is a function given the running chat. This one greets people who are added to a group.
  plugins: [(chat) => chat.on('member.added', (e) => chat.admin.post(e.conversationId, 'Welcome! Please read the pinned messages.').catch(() => {}))],
  hooks: {
    // The association's own rule, enforced before anything is stored. A real
    // platform would check credits, call a moderation service, and so on.
    'message.before': ({ message }) =>
      message.kind === 'text' && /\bfree money\b/i.test(message.body) ? { allow: false, reason: 'That looks like spam, so it was not sent.' } : undefined,
    // Link previews are the host's to produce. This demo only knows its own
    // pages; a real platform would fetch the page from a locked-down service.
    'link.preview': ({ url }) => {
      const pages = {
        '/events/reunion': { title: 'Class Reunion 2026', description: 'Saturday 12 December, Great Hall. Tickets on sale now.' },
        '/news/agm': { title: 'Annual General Meeting', description: 'Agenda, reports and how to vote.' },
      };
      const { hostname, pathname } = new URL(url);
      return hostname === 'alumni.example' && pages[pathname] ? { ...pages[pathname], siteName: 'Alumni Association' } : undefined;
    },
    // Run with --vendor-calls to route calls through a third-party video
    // service instead of the built-in peer-to-peer calls. A paid vendor would
    // mint a per-user join token here with its API key.
    ...(vendorCalls && {
      'call.join': ({ call }) => ({ url: `https://meet.jit.si/plugchat-demo-${call.id}` }),
    }),
  },
});
// Make every member findable in chat, even before they first open it.
for (const [id, { name, handles, ...rest }] of Object.entries(MEMBERS)) {
  chat.store.upsertUser(id, name);
  chat.store.setHandles(id, { ...rest, ...handles });
}

// ---- the association's own sign-in: nothing to do with PlugChat ----
// A session is a cookie the browser cannot read or forge: the member's id, when it expires, and a signature.
const SESSION_KEY = randomBytes(32);
const SESSION_HOURS = 12;
const sign = (text) => createHmac('sha256', SESSION_KEY).update(text).digest('base64url');
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const sessionCookie = (id) => {
  const body = `${id}.${Date.now() + SESSION_HOURS * 3600_000}`;
  return `session=${body}.${sign(body)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}`;
};
/** The signed-in member's id, or undefined. */
function sessionUser(req) {
  const match = /(?:^|;\s*)session=(\w+)\.(\d+)\.([\w-]+)/.exec(req.headers.cookie ?? '');
  if (!match) return undefined;
  const [, id, expires, signature] = match;
  return same(signature, sign(`${id}.${expires}`)) && Number(expires) > Date.now() && MEMBERS[id] ? id : undefined;
}
async function formBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) break;
  }
  return new URLSearchParams(raw);
}

// ---- the association's pages ----
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GEAR = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';
/** The site's top bar: its name, who is signed in, a gear for everything that is not messaging, and sign out. */
const header = (id, current) => `<header><div class="top">
  <a class="brand" href="/"><i>🎓</i><span>Alumni Association</span></a>
  ${id ? `<span class="who">${esc(MEMBERS[id].name)}</span><span class="badge" id="unread" title="Unread messages"></span>
  <a class="tool" href="/settings" title="Settings and tools" aria-label="Settings and tools"${current === 'settings' ? ' aria-current="page"' : ''}>${GEAR}</a>
  <form method="post" action="/logout"><button class="signout" type="submit">Sign out</button></form>` : ''}
</div></header>`;
const page = (title, id, current, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Alumni Association</title><link rel="stylesheet" href="/site.css">
<script>/* the same light or dark look the member chose in the chat */ document.documentElement.dataset.theme = (() => { try { const t = localStorage.getItem('plugchat:theme'); if (t === 'light' || t === 'dark') return t; } catch {} return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; })();</script></head>
<body>${header(id, current)}<main>${body}</main></body></html>`;
const html = (res, text, status = 200) => res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(text);

const settingsPage = (id) => page('Settings', id, 'settings', `
  <div class="card"><h2>Settings</h2><p>Your chat settings (appearance, privacy, notifications) are inside the chat: press your picture there.</p>
    <ul class="links">
      <li><a href="/privacy"><strong>Privacy</strong><span>What the association keeps about your messages, and who can read them.</span></a></li>
      ${STAFF.has(id) ? '<li><a href="/moderation"><strong>Moderation</strong><span>For staff: reported messages, suspensions and usage figures.</span></a></li>' : ''}
    </ul></div>
  <p class="devnote">Building a platform and want chat like this in it? Open the <a href="/plugchat/studio">setup studio</a> on this computer: choose how the chat appears (a page, a floating button or a frame), shape its look, and copy the code.</p>`);

const privacyPage = (id) => page('Privacy', id, 'privacy', `
  <div class="card"><h2>Privacy of your messages</h2>
    <p>This is the association's own page. Every platform writes its own; the chat's Privacy screen links here.</p>
    <p><strong>Where messages are kept.</strong> On the association's own server. No outside company stores or relays them.</p>
    <p><strong>Who can read them.</strong> The people in the conversation. For ordinary conversations, the association's server could too, and staff see a message when someone reports it. End-to-end encrypted conversations can only be read on their members' devices; not by staff, and not by the server.</p>
    <p><strong>What other members see about you.</strong> Your name, picture and about line. Whether you are online and whether you have read a message, unless you switch those off in the chat's Privacy screen.</p>
    <p><strong>Your choices.</strong> In the chat, press your picture, then Privacy: block people, hide your online status and read receipts. Under Settings you can download everything held about you. Ask the office to erase your account and what you sent.</p>
    <p><a href="${id ? '/' : '/'}">Back to messages</a></p></div>`);

const server = createServer(async (req, res) => {
  if (await chat.handle(req, res)) return;
  const url = new URL(req.url, 'http://localhost');
  const id = sessionUser(req);
  const membersOnly = () => (id ? false : (res.writeHead(303, { location: '/' }).end(), true));

  if (url.pathname === '/login' && req.method === 'POST') {
    const form = await formBody(req);
    const member = form.get('member') ?? '';
    const ok = Object.hasOwn(MEMBERS, member) && same(form.get('password') ?? '', DEMO_PASSWORD);
    res.writeHead(303, ok ? { 'set-cookie': [sessionCookie(member), 'signedout=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'], location: '/' } : { location: '/?error=1' }).end();
  } else if (url.pathname === '/logout' && req.method === 'POST') {
    // Remember that this visitor signed out, so the demo does not sign them straight back in.
    res.writeHead(303, { 'set-cookie': ['session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0', 'signedout=1; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400'], location: '/' }).end();
  } else if (url.pathname === '/api/chat-token') {
    // The whole integration: confirm who is signed in, sign a short-lived token.
    // 401 when nobody is: the chat then clears itself rather than keep showing the last person's messages.
    if (!id) return res.writeHead(401).end();
    const token = chat.signToken({ sub: id, ...MEMBERS[id] }, 600);
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ token }));
  } else if (url.pathname === '/moderation') {
    // The association's staff area: only staff get the short-lived admin token.
    if (membersOnly()) return;
    if (!STAFF.has(id)) return html(res, page('Moderation', id, '', '<div class="card"><h2>Staff only</h2><p>Moderation is open to the association\'s staff. In this demo that is Ama Owusu.</p><p><a href="/">Back to messages</a></p></div>'), 403);
    const token = chat.signToken({ sub: `staff:${id}`, admin: true }, 900);
    res.writeHead(302, { location: `/plugchat/admin#token=${token}`, 'cache-control': 'no-store' }).end();
  } else if (url.pathname === '/settings') {
    if (membersOnly()) return;
    html(res, settingsPage(id));
  } else if (url.pathname === '/privacy') {
    html(res, privacyPage(id));
  } else if (url.pathname === '/site.css') {
    res.writeHead(200, { 'content-type': 'text/css', 'cache-control': 'no-cache' }).end(await readFile(here('./site.css')));
  } else if (url.pathname === '/strict') {
    // The same chat on a page locked down the way security-conscious platforms lock theirs.
    if (membersOnly()) return;
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' blob: data:; media-src blob:; require-trusted-types-for 'script'; trusted-types plugchat",
    }).end(await readFile(here('./strict.html'), 'utf8'));
  } else if (url.pathname === '/strict.css') {
    res.writeHead(200, { 'content-type': 'text/css' }).end('html, body { margin: 0; height: 100%; } plug-chat { height: 100dvh; --pc-radius: 0; }');
  } else if (url.pathname === '/frameworks/react' || url.pathname === '/frameworks/vue') {
    // The chat as a React or Vue component (build first: node examples/frameworks/build.mjs).
    if (membersOnly()) return;
    const name = url.pathname.split('/').pop();
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PlugChat in ${name}</title><style>body{margin:0;font:15px system-ui,sans-serif}#status{margin:0;padding:8px 14px;height:44px;box-sizing:border-box}</style><div id="root"></div><script type="module" src="/frameworks/dist/${name}.js"></script>`);
  } else if (url.pathname.startsWith('/frameworks/dist/') && /^[\w.-]+\.js$/.test(url.pathname.slice(17))) {
    try {
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' }).end(await readFile(here(`../frameworks/dist/${url.pathname.slice(17)}`)));
    } catch {
      res.writeHead(404).end('run: node examples/frameworks/build.mjs');
    }
  } else if (url.pathname === '/iframe' || url.pathname === '/widget') {
    // Two other ways to embed the same chat; see iframe.html and widget.html.
    if (membersOnly()) return;
    html(res, await readFile(here(`.${url.pathname}.html`), 'utf8'));
  } else if (url.pathname === '/' && !id && !/(?:^|;\s*)signedout=1/.test(req.headers.cookie ?? '')) {
    // Demo convenience: a first-time visitor arrives as a member who is already signed in to the association,
    // which is how chat is met on a real platform. Signing out leads to the sign-in form.
    res.writeHead(303, { 'set-cookie': sessionCookie('ama'), location: '/' }).end();
  } else if (url.pathname === '/') {
    let text = (await readFile(here('./index.html'), 'utf8'))
      .replace('{{header}}', header(id, 'messages'))
      .replace('{{state}}', id ? 'in' : 'out')
      .replace('{{password}}', DEMO_PASSWORD)
      .replace('{{error}}', url.searchParams.has('error') ? '<p class="error" role="alert">That member and password do not match.</p>' : '');
    // Someone who is not signed in gets no chat on the page at all.
    if (!id) text = text.replace(/<div class="members-only">[\s\S]*?<\/div>/, '');
    html(res, text);
  } else {
    res.writeHead(404).end('not found');
  }
});
chat.attach(server);

const port = Number(portArg ?? process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Demo association site: http://localhost:${port}`));
