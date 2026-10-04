// Builds docs/openapi.json: every REST endpoint, its parameters and what it
// does, for tools that read OpenAPI (client generators for any language,
// Postman, Insomnia, API gateways).
//
//   node scripts/openapi.mjs          write docs/openapi.json
//   node scripts/openapi.mjs --check  fail if it is out of date or an endpoint has no description
//
// Endpoints come from the server's route table; descriptions come from
// docs/API.md, so the two cannot drift apart unnoticed.
import { readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const version = JSON.parse(read('../package.json')).version;

// 1. The endpoints the server really has.
const routes = [...read('../server/index.js').matchAll(/^\s*\['(GET|POST|PUT|PATCH|DELETE)', '(\/v1\/[^']+)'/gm)].map(([, method, path]) => ({ method, path }));

// 2. What the reference says about each. A table cell may name several: `GET` / `PUT /v1/x`, or `GET /v1/a`, `DELETE /v1/a/:id`.
const described = new Map();
let section = 'General';
for (const line of read('../docs/API.md').split('\n')) {
  const heading = /^## (.+)/.exec(line);
  if (heading) section = heading[1];
  const row = /^\| (.+?) \| (.+) \|$/.exec(line);
  if (!row) continue;
  let pending = [];
  for (const token of row[1].matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\b|(\/v1\/[^\s`,?]+)/g)) {
    if (token[1]) pending.push(token[1]);
    else {
      for (const method of pending) described.set(`${method} ${token[2]}`, { text: row[2].replace(/\*\*Admin\.\*\*\s*/, '').replace(/`/g, ''), admin: /\*\*Admin\.\*\*/.test(row[2]), section });
      pending = [];
    }
  }
}

const undocumented = routes.filter((r) => !described.has(`${r.method} ${r.path}`));

// 3. The document.
const paths = {};
for (const { method, path } of routes) {
  const doc = described.get(`${method} ${path}`) ?? { text: 'See docs/API.md.', admin: false, section: 'General' };
  const template = path.replace(/:(\w+)/g, '{$1}');
  const sentence = doc.text.split(/(?<=[.!?])\s/)[0];
  (paths[template] ??= {})[method.toLowerCase()] = {
    tags: [doc.section],
    summary: sentence.length > 120 ? `${sentence.slice(0, 117)}...` : sentence,
    description: doc.text + (doc.admin ? '\n\nNeeds a token with `admin: true`.' : ''),
    parameters: [...path.matchAll(/:(\w+)/g)].map(([, name]) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
    ...(method === 'GET' || method === 'DELETE' ? {} : { requestBody: { content: { 'application/json': { schema: { type: 'object' } } } } }),
    responses: {
      200: { description: 'Success. The fields are described in docs/API.md.', content: { 'application/json': { schema: { type: 'object' } } } },
      400: { $ref: '#/components/responses/Error' },
      401: { $ref: '#/components/responses/Error' },
      403: { $ref: '#/components/responses/Error' },
      404: { $ref: '#/components/responses/Error' },
      429: { $ref: '#/components/responses/Error' },
    },
  };
}
const document = {
  openapi: '3.0.3',
  info: {
    title: 'PlugChat API',
    version,
    description: 'The REST API of a PlugChat server. Every request carries a token signed by the host platform. Changes are made over REST; the WebSocket at /v1/ws only delivers events. Request and response fields are described in docs/API.md; this document lists every endpoint, its parameters and its purpose.',
    license: { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
  },
  servers: [{ url: '/plugchat', description: 'Wherever PlugChat is mounted (basePath)' }],
  security: [{ token: [] }],
  tags: [...new Set(Object.values(paths).flatMap((p) => Object.values(p).flatMap((o) => o.tags)))].map((name) => ({ name })),
  paths,
  components: {
    securitySchemes: { token: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'An HS256 token signed by the host platform with the shared secret: sub, exp, and optionally name, avatar, email, phone, username, handles, admin.' } },
    responses: { Error: { description: 'An error. `error` is a machine-readable code, `message` says what went wrong.', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } }, required: ['error', 'message'] } } } } },
  },
};

const text = JSON.stringify(document, null, 2) + '\n';
const target = new URL('../docs/openapi.json', import.meta.url);
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    // not generated yet
  }
  if (undocumented.length) console.error(`Endpoints with no description in docs/API.md:\n${undocumented.map((r) => `  ${r.method} ${r.path}`).join('\n')}`);
  if (current !== text) console.error('docs/openapi.json is out of date. Run: node scripts/openapi.mjs');
  process.exit(undocumented.length || current !== text ? 1 : 0);
}
writeFileSync(target, text);
console.log(`docs/openapi.json: ${routes.length} endpoints${undocumented.length ? `, ${undocumented.length} WITHOUT a description:\n${undocumented.map((r) => `  ${r.method} ${r.path}`).join('\n')}` : ', all described'}`);
