// Owns the PostgreSQL connection for postgres.js. Runs on its own thread so the
// server's main thread can wait for each answer.
import { workerData, parentPort } from 'node:worker_threads';

const { url, schema, signal, port } = workerData;
const flag = new Int32Array(signal);

let client;
const ready = (async () => {
  let pg;
  try {
    pg = (await import('pg')).default;
  } catch {
    throw new Error('the "pg" package is not installed. Run: npm install pg');
  }
  // 64-bit integers and sums arrive as text by default; every number PlugChat stores fits a JavaScript number.
  pg.types.setTypeParser(20, Number);
  pg.types.setTypeParser(1700, Number);
  client = new pg.Client({ connectionString: url });
  client.on('error', () => {}); // a dropped connection surfaces on the next query
  await client.connect();
  await client.query('SET statement_timeout = 10000; SET lock_timeout = 5000');
  if (schema) {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
  }
})();
ready.catch(() => {});

// Each distinct statement is prepared once on the server and reused.
const names = new Map();

parentPort.on('message', async (job) => {
  let reply;
  try {
    await ready;
    if (job.close) {
      await client.end();
      reply = { rows: [], count: 0 };
    } else if (!job.values) {
      await client.query(job.text);
      reply = { rows: [], count: 0 };
    } else {
      let name = names.get(job.text);
      if (!name) names.set(job.text, (name = `pc${names.size}`));
      const result = await client.query({ name, text: job.text, values: job.values });
      reply = { rows: result.rows, count: result.rowCount ?? 0 };
    }
  } catch (e) {
    reply = { error: e.message, code: e.code };
  }
  port.postMessage({ ...reply, id: job.id });
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
});
