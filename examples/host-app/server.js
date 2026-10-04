// A stand-in for "your existing platform": a members' association site with
// its own users and its own login. The only chat-specific code it needs is
// the /api/chat-token endpoint and the <plug-chat> tag in the page.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
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

const chat = createPlugChat({
  // Demo only: a real host keeps one fixed secret in its environment.
  secret: process.env.PLUGCHAT_SECRET ?? randomBytes(48).toString('base64url'),
  dataDir: here(vendorCalls ? './data-vendor' : './data'),
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

// The host's own session handling, reduced to a cookie for the demo.
const sessionUser = (req) => /(?:^|;\s*)member=(\w+)/.exec(req.headers.cookie ?? '')?.[1];

const server = createServer(async (req, res) => {
  if (await chat.handle(req, res)) return;
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/login') {
    const id = url.searchParams.get('as');
    if (!MEMBERS[id]) return res.writeHead(400).end('unknown member');
    res.writeHead(302, { 'set-cookie': `member=${id}; HttpOnly; SameSite=Lax; Path=/`, location: '/' }).end();
  } else if (url.pathname === '/api/chat-token') {
    // The whole integration: confirm who is logged in, sign a short-lived token.
    const id = sessionUser(req);
    if (!MEMBERS[id]) return res.writeHead(401).end();
    const token = chat.signToken({ sub: id, ...MEMBERS[id] }, 600);
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ token }));
  } else if (url.pathname === '/moderation') {
    // The association's staff area. A real platform checks that the signed-in
    // person is staff before handing out a short-lived admin token.
    if (!MEMBERS[sessionUser(req)]) return res.writeHead(302, { location: '/' }).end();
    const token = chat.signToken({ sub: 'staff', admin: true }, 900);
    res.writeHead(302, { location: `/plugchat/admin#token=${token}`, 'cache-control': 'no-store' }).end();
  } else if (url.pathname === '/iframe' || url.pathname === '/widget') {
    // Two other ways to embed the same chat; see iframe.html and widget.html.
    if (!MEMBERS[sessionUser(req)]) return res.writeHead(302, { location: '/' }).end();
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(await readFile(here(`.${url.pathname}.html`), 'utf8'));
  } else if (url.pathname === '/') {
    const id = sessionUser(req);
    const page = (await readFile(here('./index.html'), 'utf8'))
      .replace('{{member}}', MEMBERS[id]?.name ?? '')
      .replace('{{state}}', MEMBERS[id] ? 'in' : 'out');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
  } else {
    res.writeHead(404).end('not found');
  }
});
chat.attach(server);

const port = Number(portArg ?? process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Demo association site: http://localhost:${port}`));
