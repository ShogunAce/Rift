import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const votes = Number(process.env.STRESS_VOTES ?? 6000);
const viewers = Math.floor(votes / 2);
const peerCount = Number(process.env.STRESS_PEERS ?? 24);
const concurrency = Number(process.env.STRESS_CONCURRENCY ?? 48);
const label = process.env.STRESS_LABEL ?? 'latest';
const churnEnabled = process.env.STRESS_CHURN === 'true';
assert(votes >= 2 && votes <= 100000 && votes % 2 === 0);
assert(peerCount >= 1 && peerCount <= 200);
assert(concurrency >= 1 && concurrency <= 256);
assert(/^[a-z0-9-]+$/i.test(label));
const dir = mkdtempSync(join(tmpdir(), 'rift-stress-'));
const child = fork(resolve('scripts/stress-server.ts'), [], {
  execArgv: ['--import', 'tsx'],
  silent: true,
  env: {
    ...process.env,
    VITEST: '1',
    DATABASE_PATH: join(dir, 'stress.sqlite'),
    APP_ORIGIN: 'http://rift-stress.local',
    ALLOW_REHEARSAL: 'true',
    TWITCH_CLIENT_ID: '',
    TWITCH_CLIENT_SECRET: '',
  },
});
let serverOutput = '';
child.stderr?.on('data', (data) => {
  serverOutput += data.toString();
});
const clients: WebSocket[] = [];
const latencies: number[] = [];
let frames = 0;
let errors = 0;
let maxHeap = 0;
const started = performance.now();
async function pool(count: number, fn: (i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, count) }, async () => {
      while (next < count) await fn(next++);
    }),
  );
}
try {
  const ready = await Promise.race([
    once(child, 'message').then(([m]) => m as { address: string }),
    once(child, 'exit').then(() => {
      throw new Error(serverOutput);
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Server startup timeout')), 20000).unref(),
    ),
  ]);
  const base = ready.address;
  const origin = 'http://rift-stress.local';
  let cookie = '';
  async function request(path: string, body?: unknown, authenticated = true) {
    const start = performance.now();
    const res = await fetch(base + '/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        origin,
        ...(authenticated ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    return { status: res.status, data, headers: res.headers, ms: performance.now() - start };
  }
  const login = await request('/auth/rehearsal', {});
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie')!.split(';')[0];
  const token = (await request('/overlay/link')).data.url.split('#')[1];
  const sequences = Array(peerCount).fill(0);
  const lastSnapshots: any[] = Array(peerCount).fill(null);
  await Promise.all(
    Array.from({ length: peerCount }, async (_, i) => {
      const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws?role=overlay', {
        headers: { origin },
      });
      clients.push(ws);
      const initial = once(ws, 'message');
      ws.on('message', (raw) => {
        const s = JSON.parse(raw.toString());
        if (s.sequence < sequences[i] || s.events.length) errors++;
        sequences[i] = s.sequence;
        lastSnapshots[i] = s;
        frames++;
      });
      await once(ws, 'open');
      ws.send(JSON.stringify({ overlayToken: token }));
      await initial;
    }),
  );
  const opened = await request('/rounds', { partyLevel: 3, partyHealth: 70, duration: 300 });
  assert.equal(opened.status, 200);
  const round = opened.data;
  console.log(
    `Disk-backed baseline: ${votes} votes, ${viewers} viewers, ${peerCount} overlays, concurrency ${concurrency}`,
  );
  const burst = performance.now();
  const churn = churnEnabled
    ? pool(64, async () => {
        const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws?role=overlay', {
          headers: { origin },
        });
        clients.push(ws);
        const initial = once(ws, 'message');
        await once(ws, 'open');
        ws.send(JSON.stringify({ overlayToken: token }));
        const [raw] = await initial;
        const restored = JSON.parse(raw.toString());
        assert.equal(restored.round.status, 'voting');
        assert.deepEqual(restored.events, []);
        ws.terminate();
      })
    : Promise.resolve();
  for (let wave = 0; wave < 2; wave++) {
    await pool(viewers, async (i) => {
      const result = await request('/rehearsal/vote', {
        user: 'viewer-' + i,
        choice: wave === 0 ? 'a' : 'b',
      });
      latencies.push(result.ms);
      if (result.status !== 200 || !result.data.accepted) errors++;
    });
    console.log(
      `Wave ${wave + 1}: ${viewers} votes completed in ${Math.round(performance.now() - burst)} ms`,
    );
  }
  const duration = performance.now() - burst;
  await churn;
  let snapshot = (await request('/snapshot')).data;
  assert.deepEqual(snapshot.round.tally, { a: 0, b: viewers, c: 0 });
  assert.equal(snapshot.state.threat, 0);
  assert.equal(errors, 0);
  const closes = await Promise.all(
    Array.from({ length: 32 }, () => request(`/rounds/${round.id}/close`, {})),
  );
  assert(closes.every((r) => r.status === 200));
  assert.equal(new Set(closes.map((r) => r.data.proposal.id)).size, 1);
  const proposal = closes[0].data.proposal;
  const stale = await request(`/proposals/${proposal.id}/approve`, {
    expectedRevision: proposal.expectedRevision + 1,
  });
  assert.equal(stale.status, 409);
  const approvals = await Promise.all(
    Array.from({ length: 64 }, () =>
      request(`/proposals/${proposal.id}/approve`, { expectedRevision: proposal.expectedRevision }),
    ),
  );
  assert(approvals.every((r) => r.status === 200));
  snapshot = (await request('/snapshot')).data;
  assert.equal(snapshot.state.revision, proposal.expectedRevision + 1);
  assert.equal(snapshot.events.filter((e: any) => e.type === 'encounter.approved').length, 1);
  const target = snapshot.sequence;
  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 10000;
    const poll = setInterval(() => {
      if (sequences.every((s) => s >= target)) {
        clearInterval(poll);
        resolve();
      } else if (Date.now() > deadline) {
        clearInterval(poll);
        reject(new Error('Overlay convergence timed out'));
      }
    }, 20);
  });
  assert(lastSnapshots.every((s) => s.state.threat === proposal.cost));
  const rollbacks = await Promise.all(
    Array.from({ length: 32 }, () =>
      request('/state/rollback', { expectedRevision: snapshot.state.revision }),
    ),
  );
  assert.equal(rollbacks.filter((r) => r.status === 200).length, 1);
  assert.equal(rollbacks.filter((r) => r.status === 409).length, 31);
  const invalid = await Promise.all(
    Array.from({ length: 64 }, (_, i) =>
      request('/rounds', { partyLevel: i % 2 ? -1 : 999, partyHealth: -1, duration: 0 }),
    ),
  );
  assert(invalid.every((r) => r.status === 400));
  const denied = await Promise.all(
    Array.from({ length: 64 }, () =>
      request('/rounds', { partyLevel: 3, partyHealth: 70, duration: 60 }, false),
    ),
  );
  assert(denied.every((r) => r.status === 401));
  if (churnEnabled) {
    for (const payload of [JSON.stringify({ overlayToken: 'invalid' }), 'x'.repeat(17000)]) {
      const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws?role=overlay', {
        headers: { origin },
      });
      clients.push(ws);
      ws.on('error', () => {});
      const closed = once(ws, 'close');
      await once(ws, 'open');
      ws.send(payload);
      const [code] = await closed;
      assert.equal(code, payload.length > 16384 ? 1009 : 1008);
    }
    assert.equal((await request('/snapshot')).status, 200);
  }
  const statsPromise = once(child, 'message');
  child.send('stats');
  const [stats] = await statsPromise;
  maxHeap = stats.memory.heapUsed;
  latencies.sort((a, b) => a - b);
  const percentile = (p: number) =>
    Number(latencies[Math.floor((latencies.length - 1) * p)].toFixed(2));
  const report = {
    label,
    at: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    database: 'temporary file-backed SQLite WAL',
    votes,
    viewers,
    overlays: peerCount,
    concurrency,
    reconnectClients: churnEnabled ? 64 : 0,
    errors,
    throughputVotesPerSecond: Number((votes / (duration / 1000)).toFixed(1)),
    durationMs: Math.round(duration),
    httpLatencyMs: {
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      max: latencies.at(-1),
    },
    websocketFrames: frames,
    serverHeapMB: Number((maxHeap / 1024 / 1024).toFixed(1)),
    serverRssMB: Number((stats.memory.rss / 1024 / 1024).toFixed(1)),
    eventLoop: stats.eventLoop,
    assertions: [
      'exact latest-user tally',
      'no state mutation before approval',
      '32 closes produce one proposal',
      'stale approval rejected',
      '64 approvals produce one commit',
      'all overlays converge with increasing sequences',
      '32 rollbacks produce one compensation',
      '64 invalid requests rejected',
      '64 anonymous requests rejected',
      ...(churnEnabled
        ? [
            '64 reconnecting overlays receive authoritative snapshots',
            'invalid and oversized WebSocket messages disconnect without taking down server',
          ]
        : []),
    ],
    totalMs: Math.round(performance.now() - started),
  };
  mkdirSync('artifacts/stress', { recursive: true });
  writeFileSync(`artifacts/stress/${label}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const ws of clients) ws.terminate();
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.send('stop');
    const timer = setTimeout(() => child.kill(), 5000);
    await exited;
    clearTimeout(timer);
  }
  for (const file of readdirSync(dir)) unlinkSync(join(dir, file));
  rmdirSync(dir);
}
