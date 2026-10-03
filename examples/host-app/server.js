// A stand-in for "your existing platform": a members' association site with
// its own users and its own login. The only chat-specific code it needs is
// the /api/chat-token endpoint and the <plug-chat> tag in the page.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPlugChat } from '../../server/index.js';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));

// The association's existing member database.
const MEMBERS = {
  ama: { name: 'Ama Owusu' },
  kofi: { name: 'Kofi Mensah' },
  esi: { name: 'Esi Appiah' },
  yaw: { name: 'Yaw Boateng' },
};

const chat = createPlugChat({
  // Demo only: a real host keeps one fixed secret in its environment.
  secret: process.env.PLUGCHAT_SECRET ?? randomBytes(48).toString('base64url'),
  dataDir: here('./data'),
});
// Make every member findable in chat, even before they first open it.
for (const [id, m] of Object.entries(MEMBERS)) chat.store.upsertUser(id, m.name);

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
    const token = chat.signToken({ sub: id, name: MEMBERS[id].name }, 600);
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ token }));
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

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Demo association site: http://localhost:${port}`));
