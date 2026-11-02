import WebSocket from 'ws';
import { z } from 'zod';
import type { TwitchAuth } from '../auth/twitch-oauth.js';
const envelope = z.object({
  metadata: z.object({
    message_id: z.string(),
    message_type: z.string(),
    message_timestamp: z.string().optional(),
  }),
  payload: z.object({
    session: z
      .object({
        id: z.string(),
        keepalive_timeout_seconds: z.number().nullable().optional(),
        reconnect_url: z.string().nullable().optional(),
      })
      .optional(),
    subscription: z
      .object({
        type: z.string(),
        status: z.string().optional(),
        condition: z.object({ broadcaster_user_id: z.string() }).optional(),
      })
      .optional(),
    event: z
      .object({
        broadcaster_user_id: z.string(),
        chatter_user_id: z.string(),
        message_id: z.string(),
        message: z.object({ text: z.string() }),
      })
      .optional(),
  }),
});
export class EventSub {
  status = {
    status: 'disconnected',
    detail: 'Connect your Twitch account to receive live chat.',
  };
  private sockets = new Set<WebSocket>();
  private stopped = true;
  private gap = false;
  private retry: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private auth: TwitchAuth,
    private vote: (
      id: string,
      user: string,
      text: string,
      deliveryId: string,
      timestamp: number,
    ) => void,
    private changed: () => void,
  ) {}
  set(status: string, detail: string) {
    this.status = { status, detail };
    this.changed();
  }
  start() {
    this.stop();
    this.stopped = false;
    this.open('wss://eventsub.wss.twitch.tv/ws');
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    for (const s of this.sockets) s.close();
    this.sockets.clear();
    this.set('disconnected', 'Twitch is disconnected.');
  }
  private open(url: string, previous?: WebSocket) {
    if (this.stopped) return;
    this.set(
      'connecting',
      previous ? 'Migrating Twitch session…' : 'Establishing a Twitch subscription…',
    );
    const ws = new WebSocket(url);
    this.sockets.add(ws);
    let healthy = false;
    let migrated = false;
    let timeout = 15000;
    let watchdog: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ws.terminate(), timeout);
    };
    arm();
    ws.on('message', async (raw) => {
      arm();
      try {
        const parsed = envelope.safeParse(JSON.parse(raw.toString()));
        if (!parsed.success) return;
        const { metadata: m, payload: p } = parsed.data;
        if (m.message_type === 'session_welcome' && p.session) {
          timeout = ((p.session.keepalive_timeout_seconds ?? 10) + 5) * 1000;
          arm();
          if (!previous) {
            const token = await this.auth.access();
            const id = this.auth.identity!.id;
            const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Client-Id': this.auth.clientId,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'channel.chat.message',
                version: '1',
                condition: { broadcaster_user_id: id, user_id: id },
                transport: { method: 'websocket', session_id: p.session.id },
              }),
              signal: AbortSignal.timeout(8000),
            });
            if (!res.ok)
              throw new Error(`Twitch subscription failed (${res.status}). Reconnect Twitch.`);
          }
          healthy = true;
          if (this.stopped || !this.sockets.has(ws)) return;
          this.set(
            'connected',
            `Receiving chat from ${this.auth.identity!.login}.${this.gap ? ' Earlier connection gap: some votes may be missing.' : ''}`,
          );
          if (previous) {
            previous.close();
          }
        }
        if (
          m.message_type === 'notification' &&
          p.subscription?.type === 'channel.chat.message' &&
          p.event
        ) {
          if (p.event.broadcaster_user_id !== this.auth.identity?.id) return;
          this.vote(
            p.event.message_id,
            p.event.chatter_user_id,
            p.event.message.text,
            m.message_id,
            m.message_timestamp ? Date.parse(m.message_timestamp) : NaN,
          );
        }
        if (m.message_type === 'session_reconnect' && p.session?.reconnect_url) {
          const target = new URL(p.session.reconnect_url);
          if (target.protocol !== 'wss:' || target.hostname !== 'eventsub.wss.twitch.tv')
            throw new Error('Unexpected Twitch reconnect address');
          migrated = true;
          this.open(target.href, ws);
        }
        if (m.message_type === 'revocation') {
          this.stop();
          this.set('revoked', 'Twitch revoked chat access. Reconnect your account.');
        }
      } catch (err) {
        this.set('error', err instanceof Error ? err.message : 'Twitch event processing failed');
        ws.close();
      }
    });
    ws.on('error', () => {
      this.set('disconnected', 'Twitch connection failed. Votes may have been missed.');
    });
    ws.on('close', () => {
      clearTimeout(watchdog);
      this.sockets.delete(ws);
      if (!this.stopped && previous && !healthy) {
        this.sockets.delete(previous);
        previous.terminate();
      }
      if (this.stopped || migrated || this.sockets.size) return;
      this.gap = true;
      this.set(
        'disconnected',
        healthy
          ? 'Connection lost. Votes during the gap cannot be recovered.'
          : 'Unable to establish Twitch chat. Retrying shortly.',
      );
      this.retry = setTimeout(() => this.open('wss://eventsub.wss.twitch.tv/ws'), 5000);
    });
  }
}
