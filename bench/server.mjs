// The PlugChat under test, in its own process so the load generator does not share its CPU core.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createPlugChat } from '../server/index.js';

const dir = mkdtempSync(join(tmpdir(), 'plugchat-bench-'));
const chat = createPlugChat({ secret: process.env.PLUGCHAT_SECRET, dataDir: dir, rateLimit: { perSecond: 1e6, burst: 1e6 }, log: { error() {} } });
const server = await chat.listen(0, '127.0.0.1');
const lag = monitorEventLoopDelay({ resolution: 10 });
lag.enable();

process.on('message', (message) => {
  if (message === 'stats') {
    process.send({ rss: process.memoryUsage().rss, lagP99: lag.percentile(99) / 1e6, lagMax: lag.max / 1e6 });
    lag.reset();
  }
  if (message === 'stop') {
    server.close();
    server.closeAllConnections();
    chat.close();
    rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  }
});
process.send({ port: server.address().port });
