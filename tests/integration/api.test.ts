import { it, expect } from 'vitest';
import { createApp } from '../../apps/server/src/index';
it('protects actions and overlay access, validates OAuth state, and serves the approval loop', async () => {
  const { app } = await createApp({ database: ':memory:', origin: 'http://localhost:5173' });
  try {
    const headers = { origin: 'http://localhost:5173' };
    expect(
      (await app.inject({ method: 'POST', url: '/api/rounds', headers, payload: {} })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/rehearsal',
          headers: { origin: 'https://evil.example' },
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject('/api/auth/twitch/callback?code=x&state=wrong')).statusCode).toBe(403);
    expect((await app.inject('/api/overlay/bootstrap')).statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/api/auth/rehearsal', headers });
    const cookie = login.headers['set-cookie']!.toString().split(';')[0];
    const authorized = { ...headers, cookie };
    expect(
      (await app.inject({ method: 'POST', url: '/api/twitch/disconnect', headers })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/api/twitch/disconnect', headers: authorized }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: '/api/me', headers: authorized })).json().session,
    ).not.toBeNull();
    const round = (
      await app.inject({
        method: 'POST',
        url: '/api/rounds',
        headers: authorized,
        payload: { partyLevel: 3, partyHealth: 70, duration: 60 },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: '/api/rehearsal/vote',
      headers: authorized,
      payload: { user: 'viewer', choice: 'a' },
    });
    const p = (
      await app.inject({
        method: 'POST',
        url: `/api/rounds/${round.id}/close`,
        headers: authorized,
      })
    ).json().proposal;
    const result = await app.inject({
      method: 'POST',
      url: `/api/proposals/${p.id}/approve`,
      headers: authorized,
      payload: { expectedRevision: p.expectedRevision },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().threat).toBe(35);
    const link = (await app.inject({ url: '/api/overlay/link', headers: authorized })).json().url;
    const overlay = await app.inject({
      url: '/api/overlay/bootstrap',
      headers: { authorization: 'Bearer ' + link.split('#')[1] },
    });
    expect(overlay.statusCode).toBe(200);
    expect(overlay.json().events).toEqual([]);
    expect(overlay.json().round.id).toBe('');
    expect(JSON.stringify(overlay.json())).not.toContain('access_token');
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: authorized });
    expect((await app.inject({ url: '/api/snapshot', headers: authorized })).statusCode).toBe(401);
  } finally {
    await app.close();
  }
});
