// PlugChat starter for Node.js (no packages needed).
// The two things your backend adds: a token endpoint, and a webhook receiver.
//
//   PLUGCHAT_SECRET=... node server.mjs
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.PLUGCHAT_SECRET;
const PORT = Number(process.env.PORT ?? 8080);
if (!SECRET) throw new Error('Set PLUGCHAT_SECRET (the same value PlugChat was started with).');

// Replace this with the person signed in to YOUR site (session, cookie, auth middleware).
// Never take the user id from the request's query string or body.
function currentUser(req) {
  return { id: 'demo-user', name: 'Demo User' };
}

const b64 = (value) => Buffer.from(value).toString('base64url');

/** A short-lived token that tells PlugChat who this person is. */
function chatToken(user) {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ sub: user.id, name: user.name, exp: Math.floor(Date.now() / 1000) + 300 }));
  const signature = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}

/** Did this webhook really come from your PlugChat? */
function signedByPlugChat(rawBody, header) {
  const expected = Buffer.from('sha256=' + createHmac('sha256', SECRET).update(rawBody).digest('hex'));
  const given = Buffer.from(header ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;

  if (req.method === 'GET' && path === '/api/chat-token') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ token: chatToken(currentUser(req)) }));
  }

  if (req.method === 'POST' && path === '/webhooks/plugchat') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    if (!signedByPlugChat(raw, req.headers['x-plugchat-signature'])) return res.writeHead(401).end();
    const event = JSON.parse(raw);
    // e.g. event.type === 'message.new': send your own push notification or email to event.recipients
    console.log('plugchat event:', event.type);
    return res.writeHead(204).end();
  }

  res.writeHead(404).end();
}).listen(PORT, () => console.log(`listening on http://localhost:${PORT}`));
