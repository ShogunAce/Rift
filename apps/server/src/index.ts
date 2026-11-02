import 'dotenv/config';
import Fastify, { type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import staticFiles from '@fastify/static';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import type WebSocket from 'ws';
import { Repository } from './storage/repository.js';
import { TwitchAuth } from './auth/twitch-oauth.js';
import { EventSub } from './twitch/eventsub.js';
import { initialState } from './domain/encounter.js';
import { overlaySnapshot, sendSnapshot } from './realtime/snapshots.js';
const config = z
  .object({
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().default(3001),
    APP_ORIGIN: z.string().url().default('http://localhost:5173'),
    DATABASE_PATH: z.string().default('data/rift.sqlite'),
    TWITCH_CLIENT_ID: z.string().default(''),
    TWITCH_CLIENT_SECRET: z.string().default(''),
    TWITCH_REDIRECT_URI: z.string().url().default('http://localhost:5173/api/auth/twitch/callback'),
    ALLOW_REHEARSAL: z.enum(['true', 'false']).default('true'),
  })
  .parse(process.env);
export async function createApp(options: { database?: string; origin?: string } = {}) {
  const app = Fastify({ logger: false, bodyLimit: 16384 });
  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 16384 } });
  const origin = options.origin ?? config.APP_ORIGIN;
  const repo = new Repository(options.database ?? config.DATABASE_PATH);
  const auth = new TwitchAuth(
    config.TWITCH_CLIENT_ID,
    config.TWITCH_CLIENT_SECRET,
    config.TWITCH_REDIRECT_URI,
  );
  type Session = { mode: 'live' | 'rehearsal'; actor: string; expires: number };
  const sessions = new Map<string, Session>();
  const pending = new Map<string, number>();
  const peers = new Map<WebSocket, { overlay: boolean; session?: string }>();
  let mode: 'live' | 'rehearsal' = repo.get('mode') ?? 'rehearsal';
  let overlayKey = repo.get<string>('overlayKey') ?? randomBytes(32).toString('hex');
  repo.put('overlayKey', overlayKey);
  function changeWorkspace(next: 'live' | 'rehearsal', owner: string) {
    const prior = repo.get<string>('owner');
    if (prior !== owner || mode !== next) {
      repo.tx(() => {
        const revision = repo.state().revision + 1;
        repo.put('state', { ...initialState(), revision });
        repo.put('round', null);
        repo.put('undo', null);
        repo.put('owner', owner);
        repo.event('workspace.changed', {
          mode: next,
          owner,
          reason: 'Separate broadcaster and rehearsal state',
        });
      });
      overlayKey = randomBytes(32).toString('hex');
      repo.put('overlayKey', overlayKey);
    }
    mode = next;
    repo.put('mode', mode);
  }
  const equal = (a: string, b: string) => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  };
  const session = (id: string | undefined) => {
    const s = id ? sessions.get(id) : undefined;
    return s && s.expires > Date.now() ? s : undefined;
  };
  const snapshot = (overlay = false) => {
    const s = { ...repo.snapshot(), connection: twitch.status, mode };
    return overlay ? overlaySnapshot(s) : s;
  };
  let broadcastTimer: ReturnType<typeof setTimeout> | undefined;
  let lastBroadcastSequence = -1;
  function scheduleBroadcast() {
    if (!broadcastTimer) broadcastTimer = setTimeout(broadcast, 50);
  }
  function broadcast() {
    clearTimeout(broadcastTimer);
    broadcastTimer = undefined;
    if (!peers.size) return;
    const current = snapshot();
    if (current.sequence === lastBroadcastSequence) return;
    lastBroadcastSequence = current.sequence;
    let hostFrame: string | undefined;
    let overlayFrame: string | undefined;
    for (const [ws, p] of peers) {
      if (!p.overlay && !session(p.session)) {
        ws.close(1008, 'Session expired');
        continue;
      }
      const frame = p.overlay
        ? (overlayFrame ??= JSON.stringify(overlaySnapshot(current)))
        : (hostFrame ??= JSON.stringify(current));
      sendSnapshot(ws, frame);
    }
  }
  const twitch = new EventSub(
    auth,
    (id, user, text, deliveryId, timestamp) => {
      if (repo.vote(id, user, text, 'live', deliveryId, timestamp)) scheduleBroadcast();
    },
    () => {
      repo.event('connection.changed', { ...twitch.status });
      broadcast();
    },
  );
  function issue(reply: FastifyReply, s: Omit<Session, 'expires'>) {
    const id = randomBytes(32).toString('hex');
    sessions.set(id, { ...s, expires: Date.now() + 12 * 3600000 });
    reply.setCookie('rift_session', id, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: origin.startsWith('https:'),
      maxAge: 43200,
    });
  }
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Referrer-Policy', 'no-referrer').header('X-Content-Type-Options', 'nosniff');
    if (req.url.startsWith('/api') || req.url.startsWith('/ws'))
      reply.header('Cache-Control', 'no-store');
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.headers.origin !== origin)
      return reply.code(403).send({ error: 'Request origin is not authorized' });
  });
  app.setErrorHandler((err, req, reply) => {
    const error = err as Error & { statusCode?: number };
    reply
      .code(error instanceof z.ZodError ? 400 : (error.statusCode ?? 409))
      .send({ error: error instanceof z.ZodError ? 'Invalid request fields' : error.message });
  });
  app.get('/api/me', async (req) => ({
    session: session(req.cookies.rift_session) ?? null,
    identity: auth.identity,
    configured: auth.configured,
    rehearsalAvailable: config.ALLOW_REHEARSAL === 'true',
    connection: twitch.status,
  }));
  app.get('/api/auth/twitch/start', async (req, reply) => {
    if (!auth.configured)
      return reply.code(503).send({
        error: 'Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env, then restart RIFT.',
      });
    const state = randomBytes(32).toString('hex');
    pending.set(state, Date.now() + 600000);
    reply.setCookie('rift_oauth', state, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: origin.startsWith('https:'),
      maxAge: 600,
    });
    return reply.redirect(
      'https://id.twitch.tv/oauth2/authorize?' +
        new URLSearchParams({
          client_id: auth.clientId,
          redirect_uri: auth.redirect,
          response_type: 'code',
          scope: 'user:read:chat',
          force_verify: 'true',
          state,
        }),
    );
  });
  app.get('/api/auth/twitch/callback', async (req, reply) => {
    const query = z.object({ state: z.string(), code: z.string() }).parse(req.query);
    const expiry = pending.get(query.state);
    pending.delete(query.state);
    reply.clearCookie('rift_oauth', { path: '/' });
    if (!expiry || expiry < Date.now() || !equal(req.cookies.rift_oauth ?? '', query.state))
      return reply.code(403).send({ error: 'OAuth state validation failed. Start sign-in again.' });
    const existingId = auth.identity?.id;
    const identity = await auth.exchange(query.code);
    if (!existingId) {
      sessions.clear();
      for (const ws of peers.keys()) ws.close();
    }
    changeWorkspace('live', identity.id);
    issue(reply, { actor: identity.id, mode });
    twitch.start();
    return reply.redirect(origin + '/app');
  });
  app.post('/api/auth/rehearsal', async (req, reply) => {
    if (config.ALLOW_REHEARSAL !== 'true' || auth.identity)
      return reply
        .code(403)
        .send({ error: 'Rehearsal unavailable while a broadcaster is connected' });
    changeWorkspace('rehearsal', 'local-rehearsal');
    issue(reply, { mode, actor: 'local-rehearsal' });
    return { ok: true };
  });
  app.register(async (secure) => {
    secure.addHook('preHandler', async (req, reply) => {
      const s = session(req.cookies.rift_session);
      if (!s || s.mode !== mode || (s.mode === 'live' && s.actor !== auth.identity?.id))
        return reply.code(401).send({ error: 'Sign in to control this encounter' });
    });
    secure.get('/api/snapshot', async () => snapshot());
    secure.get('/api/events', async () => repo.snapshot().events);
    secure.get('/api/overlay/link', async () => ({ url: origin + '/overlay#' + overlayKey }));
    secure.post('/api/auth/logout', async (req, reply) => {
      sessions.clear();
      twitch.stop();
      auth.clear();
      for (const ws of peers.keys()) ws.close();
      reply.clearCookie('rift_session', { path: '/' });
      return { ok: true };
    });
    secure.post('/api/twitch/reconnect', async () => {
      await auth.validate();
      twitch.start();
      return { ok: true };
    });
    secure.post('/api/twitch/disconnect', async (req) => {
      twitch.stop();
      repo.event('chat.disconnected', { actor: session(req.cookies.rift_session)!.actor });
      broadcast();
      return { ok: true };
    });
    secure.post('/api/rounds', async (req) => {
      const data = z
        .object({
          partyLevel: z.number().int().min(1).max(20),
          partyHealth: z.number().min(0).max(100),
          duration: z.number().int().min(10).max(300),
        })
        .parse(req.body);
      if (mode === 'live' && twitch.status.status !== 'connected')
        throw new Error('Wait for a verified Twitch chat connection');
      const r = repo.start(data.partyLevel, data.partyHealth, data.duration, mode);
      broadcast();
      return r;
    });
    secure.post('/api/rounds/:id/close', async (req) => {
      const { id } = req.params as { id: string };
      const r = repo.close(id);
      broadcast();
      return r;
    });
    for (const action of ['pause', 'resume', 'cancel'] as const)
      secure.post(`/api/rounds/:id/${action}`, async (req) => {
        const { expectedRevision } = z
          .object({ expectedRevision: z.number().int().nonnegative() })
          .parse(req.body);
        const result = repo.controlRound(
          (req.params as { id: string }).id,
          expectedRevision,
          action,
          session(req.cookies.rift_session)!.actor,
        );
        broadcast();
        return result;
      });
    secure.post('/api/party/recover', async (req) => {
      const { expectedRevision, action } = z
        .object({
          expectedRevision: z.number().int().nonnegative(),
          action: z.enum(['potion', 'rest']),
        })
        .parse(req.body);
      const result = repo.recover(
        expectedRevision,
        action,
        session(req.cookies.rift_session)!.actor,
      );
      broadcast();
      return result;
    });
    secure.post('/api/rounds/:id/reset', async (req) => {
      const { expectedRevision } = z
        .object({ expectedRevision: z.number().int().nonnegative() })
        .parse(req.body);
      if (mode === 'live' && twitch.status.status !== 'connected')
        throw new Error('Reconnect Twitch chat before resetting voting');
      const round = repo.reset(
        (req.params as { id: string }).id,
        expectedRevision,
        session(req.cookies.rift_session)!.actor,
      );
      broadcast();
      return round;
    });
    for (const action of ['approve', 'reject'])
      secure.post(`/api/proposals/:id/${action}`, async (req) => {
        const { expectedRevision } = z
          .object({ expectedRevision: z.number().int().nonnegative() })
          .parse(req.body);
        const r = repo.decide(
          (req.params as { id: string }).id,
          expectedRevision,
          action === 'approve',
          session(req.cookies.rift_session)!.actor,
        );
        broadcast();
        return r;
      });
    secure.post('/api/state/rollback', async (req) => {
      const { expectedRevision } = z
        .object({ expectedRevision: z.number().int().nonnegative() })
        .parse(req.body);
      repo.rollback(expectedRevision, session(req.cookies.rift_session)!.actor);
      broadcast();
      return { ok: true };
    });
    secure.post('/api/rehearsal/vote', async (req) => {
      if (mode !== 'rehearsal') throw new Error('Synthetic votes are disabled in live mode');
      const { user, choice } = z
        .object({ user: z.string().min(1).max(64), choice: z.enum(['a', 'b', 'c']) })
        .parse(req.body);
      const accepted = repo.vote(
        'rehearsal:' + randomBytes(16).toString('hex'),
        user,
        '!rift ' + choice,
        'rehearsal',
      );
      if (accepted) scheduleBroadcast();
      return { accepted };
    });
  });
  app.get('/api/overlay/bootstrap', async (req, reply) => {
    if (!equal(req.headers.authorization?.replace('Bearer ', '') ?? '', overlayKey))
      return reply.code(401).send({ error: 'Invalid overlay credential' });
    return snapshot(true);
  });
  app.get('/ws', { websocket: true }, (ws, req) => {
    if (req.headers.origin !== origin) {
      ws.close(1008, 'Origin rejected');
      return;
    }
    const s = session(req.cookies.rift_session);
    const overlay = (req.query as { role?: string }).role === 'overlay';
    if (s && !overlay) {
      peers.set(ws, { overlay: false, session: req.cookies.rift_session });
      ws.send(JSON.stringify(snapshot()));
    } else {
      const timer = setTimeout(() => ws.close(1008, 'Authentication required'), 5000);
      ws.once('message', (raw) => {
        clearTimeout(timer);
        try {
          const msg = z.object({ overlayToken: z.string() }).parse(JSON.parse(raw.toString()));
          if (!equal(msg.overlayToken, overlayKey)) throw new Error();
          peers.set(ws, { overlay: true });
          ws.send(JSON.stringify(snapshot(true)));
        } catch {
          ws.close(1008, 'Invalid overlay credential');
        }
      });
      ws.on('close', () => clearTimeout(timer));
    }
    ws.on('close', () => peers.delete(ws));
  });
  const tick = setInterval(() => {
    const r = repo.round();
    if (r?.status === 'voting' && r.pausedAt === undefined && Date.now() >= r.deadline) {
      repo.close(r.id);
      broadcast();
    }
    for (const [id, s] of sessions) if (s.expires < Date.now()) sessions.delete(id);
    for (const [id, expiry] of pending) if (expiry < Date.now()) pending.delete(id);
  }, 250);
  const validation = setInterval(() => {
    if (auth.identity)
      void auth.validate().catch(() => {
        twitch.stop();
        auth.clear();
        sessions.clear();
        twitch.set('revoked', 'Authorization expired. Sign in again.');
      });
  }, 3600000);
  if (existsSync(resolve('dist/web'))) {
    await app.register(staticFiles, { root: resolve('dist/web') });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api')
        ? reply.code(404).send({ error: 'Not found' })
        : reply.sendFile('index.html'),
    );
  }
  app.addHook('onClose', async () => {
    clearInterval(tick);
    clearTimeout(broadcastTimer);
    clearInterval(validation);
    twitch.stop();
    for (const ws of peers.keys()) ws.close();
    repo.db.close();
  });
  return { app, repo };
}
if (!process.env.VITEST) {
  const { app } = await createApp();
  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(`RIFT server listening at http://${config.HOST}:${config.PORT}`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
}
