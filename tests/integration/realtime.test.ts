import { it, expect } from 'vitest';
import { once } from 'node:events';
import { createApp } from '../../apps/server/src/index';
it('authenticates a read-only overlay, strips private evidence, resynchronizes and rejects its mutations', async () => {
  const { app, repo } = await createApp({ database: ':memory:', origin: 'http://localhost:5173' });
  await app.ready();
  const origin = 'http://localhost:5173';
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/rehearsal',
    headers: { origin },
  });
  const cookie = login.headers['set-cookie']!.toString().split(';')[0];
  const link = (await app.inject({ url: '/api/overlay/link', headers: { cookie } })).json().url;
  const token = link.split('#')[1];
  const ws = await app.injectWS('/ws?role=overlay', { headers: { origin, cookie } });
  try {
    const initial = once(ws, 'message');
    ws.send(JSON.stringify({ overlayToken: token }));
    const first = JSON.parse((await initial)[0].toString());
    expect(first.events).toEqual([]);
    const next = once(ws, 'message');
    const response = await app.inject({
      method: 'POST',
      url: '/api/rounds',
      headers: { origin, cookie },
      payload: { partyLevel: 3, partyHealth: 70, duration: 10 },
    });
    expect(response.statusCode).toBe(200);
    const update = JSON.parse((await next)[0].toString());
    expect(update.sequence).toBeGreaterThan(first.sequence);
    expect(update.round.id).toBe('');
    expect(update.round.seed).toBe('');
    expect(update.events).toEqual([]);
    const denied = await app.inject({
      method: 'POST',
      url: '/api/state/rollback',
      headers: { origin, authorization: 'Bearer ' + token },
      payload: { expectedRevision: update.state.revision },
    });
    expect(denied.statusCode).toBe(401);
    const r = repo.round()!;
    r.deadline = Date.now() - 1;
    repo.put('round', r);
    const deadlineMessage = once(ws, 'message');
    const expired = JSON.parse((await deadlineMessage)[0].toString());
    expect(expired.round.status).toBe('cancelled');
    ws.terminate();
    const reconnect = await app.injectWS('/ws?role=overlay', { headers: { origin } });
    const recovered = once(reconnect, 'message');
    reconnect.send(JSON.stringify({ overlayToken: token }));
    const last = JSON.parse((await recovered)[0].toString());
    expect(last.sequence).toBe(expired.sequence);
    expect(last.round.status).toBe('cancelled');
    reconnect.terminate();
  } finally {
    ws.terminate();
    await app.close();
  }
});
