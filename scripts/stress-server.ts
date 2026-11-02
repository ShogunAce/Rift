import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createApp } from '../apps/server/src/index.js';
const { app } = await createApp();
const lag = monitorEventLoopDelay({ resolution: 10 });
lag.enable();
const address = await app.listen({ host: '127.0.0.1', port: 0 });
process.send?.({ type: 'ready', address });
process.on('message', async (message) => {
  if (message === 'stats')
    process.send?.({
      type: 'stats',
      memory: process.memoryUsage(),
      eventLoop: { meanMs: lag.mean / 1e6, p95Ms: lag.percentile(95) / 1e6, maxMs: lag.max / 1e6 },
    });
  if (message === 'stop') {
    lag.disable();
    await app.close();
    process.exit(0);
  }
});
