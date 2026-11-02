import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TwitchAuth } from '../../apps/server/src/auth/twitch-oauth';
const sockets = vi.hoisted(() => [] as any[]);
vi.mock('ws', () => ({
  default: class MockSocket extends EventEmitter {
    constructor(public url: string) {
      super();
      sockets.push(this);
    }
    close() {
      this.emit('close');
    }
    terminate() {
      this.emit('close');
    }
  },
}));
import { EventSub } from '../../apps/server/src/twitch/eventsub';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sockets.length = 0;
});
const packet = (message_type: string, payload: unknown) =>
  JSON.stringify({
    metadata: {
      message_id: 'delivery-1',
      message_type,
      message_timestamp: new Date().toISOString(),
    },
    payload,
  });
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
describe('Twitch protocol contract with mocked provider', () => {
  it('preserves the active broadcaster credentials when another account attempts to connect', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: 'candidate-token',
              refresh_token: 'candidate-refresh',
              expires_in: 3600,
            }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              client_id: 'client',
              user_id: 'other',
              login: 'other',
              scopes: ['user:read:chat'],
            }),
          ),
        ),
    );
    const auth = new TwitchAuth('client', 'secret', 'http://localhost/callback');
    auth.token = 'existing-token';
    auth.refresh = 'existing-refresh';
    auth.identity = { id: 'owner', login: 'owner', name: 'owner' };
    auth.expires = Date.now() + 3600000;
    await expect(auth.exchange('candidate-code')).rejects.toThrow('Another broadcaster');
    expect(auth.token).toBe('existing-token');
    expect(auth.refresh).toBe('existing-refresh');
    expect(auth.identity.id).toBe('owner');
  });
  it('exchanges authorization code, validates identity, and refreshes expired tokens', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'test-access',
            refresh_token: 'test-refresh',
            expires_in: 3600,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            client_id: 'client',
            user_id: '42',
            login: 'keeper',
            scopes: ['user:read:chat'],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'refreshed-access',
            refresh_token: 'refreshed-refresh',
            expires_in: 3600,
          }),
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    const auth = new TwitchAuth('client', 'test-secret', 'http://localhost/callback');
    expect((await auth.exchange('test-code')).id).toBe('42');
    expect(fetcher.mock.calls[0][1].body.get('grant_type')).toBe('authorization_code');
    auth.expires = 0;
    expect(await auth.access()).toBe('refreshed-access');
    expect(fetcher.mock.calls[2][1].body.get('grant_type')).toBe('refresh_token');
  });
  it('does not report connected until subscription succeeds; routes exact chat identity and handles migration', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }));
    vi.stubGlobal('fetch', fetcher);
    const auth = {
      clientId: 'client',
      identity: { id: '42', login: 'keeper' },
      access: async () => 'test-token',
    } as TwitchAuth;
    const vote = vi.fn();
    const stream = new EventSub(auth, vote, () => {});
    stream.start();
    expect(stream.status.status).toBe('connecting');
    const first = sockets[0];
    first.emit(
      'message',
      packet('session_welcome', { session: { id: 's1', keepalive_timeout_seconds: 10 } }),
    );
    await flush();
    expect(stream.status.status).toBe('connected');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      type: 'channel.chat.message',
      version: '1',
      condition: { broadcaster_user_id: '42', user_id: '42' },
      transport: { session_id: 's1' },
    });
    first.emit(
      'message',
      packet('notification', {
        subscription: { type: 'channel.chat.message' },
        event: {
          broadcaster_user_id: '42',
          chatter_user_id: 'viewer',
          message_id: 'chat-id',
          message: { text: '!rift a' },
        },
      }),
    );
    expect(vote).toHaveBeenCalledWith(
      'chat-id',
      'viewer',
      '!rift a',
      'delivery-1',
      expect.any(Number),
    );
    first.emit(
      'message',
      packet('session_reconnect', {
        session: { id: 's1', reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?reconnect=test' },
      }),
    );
    sockets[1].emit(
      'message',
      packet('session_welcome', { session: { id: 's2', keepalive_timeout_seconds: 10 } }),
    );
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(stream.status.status).toBe('connected');
    stream.stop();
  });
  it('times out missing keepalives, reconnects, and preserves the lost-vote warning', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 202 })));
    const auth = {
      clientId: 'client',
      identity: { id: '42', login: 'keeper' },
      access: async () => 'token',
    } as TwitchAuth;
    const stream = new EventSub(
      auth,
      () => {},
      () => {},
    );
    stream.start();
    sockets[0].emit(
      'message',
      packet('session_welcome', { session: { id: 's1', keepalive_timeout_seconds: 10 } }),
    );
    await flush();
    await vi.advanceTimersByTimeAsync(15000);
    expect(stream.status.status).toBe('disconnected');
    await vi.advanceTimersByTimeAsync(5000);
    sockets[1].emit(
      'message',
      packet('session_welcome', { session: { id: 's2', keepalive_timeout_seconds: 10 } }),
    );
    await flush();
    expect(stream.status.status).toBe('connected');
    expect(stream.status.detail).toContain('votes may be missing');
    stream.stop();
  });
  it('revocation stops retrying and invalid identity is rejected', async () => {
    vi.useFakeTimers();
    const stream = new EventSub(
      {} as TwitchAuth,
      () => {},
      () => {},
    );
    stream.start();
    sockets[0].emit(
      'message',
      packet('revocation', {
        subscription: { type: 'channel.chat.message', status: 'authorization_revoked' },
      }),
    );
    expect(stream.status.status).toBe('revoked');
    await vi.advanceTimersByTimeAsync(30000);
    expect(sockets).toHaveLength(1);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            client_id: 'wrong',
            user_id: '42',
            login: 'keeper',
            scopes: ['user:read:chat'],
          }),
        ),
      ),
    );
    const auth = new TwitchAuth('client', 'secret', 'http://localhost/callback');
    auth.token = 'token';
    auth.expires = Date.now() + 3600000;
    await expect(auth.validate()).rejects.toThrow('permission');
  });
});
