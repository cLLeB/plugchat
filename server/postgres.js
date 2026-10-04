// PostgreSQL as the database, for platforms that already run one or need
// several PlugChat instances on different machines to share their data.
//
// The rest of the server talks to its database synchronously (that is what
// makes SQLite so simple to embed). To keep one code path, this adapter gives
// PostgreSQL the same synchronous face: queries run on a worker thread that
// owns the connection, and the calling thread waits for each answer. The SQL
// is written once, in store.js, in the dialect both databases share, and the
// few differences are translated here.
//
// Needs the `pg` package: npm install pg
import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads';

const QUERY_TIMEOUT_MS = 30_000;
// Tables whose id is assigned by the database and read back by the caller.
const SERIAL_INSERT = /^\s*INSERT INTO (bus|audit|webhook_queue)\b/i;

/** Rewrite a statement from the shared dialect to PostgreSQL's. */
export function toPostgres(sql) {
  let s = sql.replace(/\bINTEGER PRIMARY KEY AUTOINCREMENT\b/g, 'BIGSERIAL PRIMARY KEY');
  // Timestamps are milliseconds and do not fit a 32-bit INTEGER.
  if (/^\s*(CREATE|ALTER)\s/i.test(s)) s = s.replace(/\bINTEGER\b/g, 'BIGINT');
  s = s
    .replace(/\bBEGIN IMMEDIATE\b/g, 'BEGIN')
    .replace(/\bLIMIT -1 OFFSET\b/g, 'OFFSET')
    .replace(/\bMIN\(\?,/g, 'LEAST(?,')
    .replace(/\bLIKE\b/g, 'ILIKE'); // SQLite's LIKE ignores case; ILIKE is the PostgreSQL equivalent
  if (/\bINSERT OR IGNORE INTO\b/.test(s)) s = `${s.replace(/\bINSERT OR IGNORE INTO\b/, 'INSERT INTO')} ON CONFLICT DO NOTHING`;
  if (SERIAL_INSERT.test(s)) s += ' RETURNING id';
  // ? placeholders become $1, $2, ... (never inside a quoted string)
  let n = 0;
  let quoted = false;
  let out = '';
  for (const ch of s) {
    if (ch === "'") quoted = !quoted;
    out += ch === '?' && !quoted ? `$${++n}` : ch;
  }
  return out;
}

export class PostgresDatabase {
  /**
   * @param {object} settings
   * @param {string} settings.url     postgres://user:password@host:5432/database
   * @param {string} [settings.schema] Keep PlugChat's tables in their own schema (created if missing).
   */
  constructor({ url, schema }) {
    if (!url) throw new Error('PlugChat: database.url is required, e.g. postgres://user:password@localhost:5432/chat');
    if (schema && !/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('PlugChat: database.schema may only contain lowercase letters, digits and underscores');
    const signal = new SharedArrayBuffer(4);
    const { port1, port2 } = new MessageChannel();
    this._flag = new Int32Array(signal);
    this._port = port1;
    this._worker = new Worker(new URL('./postgres-worker.js', import.meta.url), { workerData: { url, schema, signal, port: port2 }, transferList: [port2] });
    this._worker.unref();
    port1.unref();
    this._call({ text: 'SELECT 1' }); // fail now, with a clear message, if the database cannot be reached
  }

  /** Send one job to the worker and wait for its answer. */
  _call(job) {
    Atomics.store(this._flag, 0, 0);
    this._worker.postMessage(job);
    if (Atomics.wait(this._flag, 0, 0, QUERY_TIMEOUT_MS) === 'timed-out') throw new Error('PlugChat: the database did not answer in time');
    const reply = receiveMessageOnPort(this._port)?.message;
    if (!reply) throw new Error('PlugChat: the database connection was lost');
    if (reply.error) throw Object.assign(new Error(`PlugChat database: ${reply.error}`), { code: reply.code });
    return reply;
  }

  /** Run statements that take no values (schema, BEGIN, COMMIT). */
  exec(sql) {
    this._call({ text: toPostgres(sql) });
  }

  prepare(sql) {
    const text = toPostgres(sql);
    const query = (values) => this._call({ text, values: values.map((v) => (v === undefined ? null : typeof v === 'bigint' ? Number(v) : v)) });
    return {
      get: (...values) => query(values).rows[0],
      all: (...values) => query(values).rows,
      run: (...values) => {
        const reply = query(values);
        return { changes: reply.count, lastInsertRowid: reply.rows[0]?.id };
      },
    };
  }

  close() {
    try {
      this._call({ close: true });
    } catch {
      // already gone
    }
    this._worker.terminate();
    this._port.close();
  }
}
