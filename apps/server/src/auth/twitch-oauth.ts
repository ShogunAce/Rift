import { z } from 'zod';
const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});
export interface Identity {
  id: string;
  login: string;
  name: string;
}
export class TwitchAuth {
  token: string | null = null;
  refresh: string | null = null;
  identity: Identity | null = null;
  expires = 0;
  constructor(
    public clientId: string,
    private secret: string,
    public redirect: string,
  ) {}
  get configured() {
    return !!this.clientId && !!this.secret;
  }
  async exchange(code: string) {
    // Validate a candidate before replacing a working broadcaster's credentials.
    const candidate = new TwitchAuth(this.clientId, this.secret, this.redirect);
    await candidate.getToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirect,
    });
    const identity = await candidate.validate();
    if (this.identity && this.identity.id !== identity.id)
      throw new Error(
        'Another broadcaster is connected. Disconnect Twitch in the existing RIFT session before switching accounts.',
      );
    this.token = candidate.token;
    this.refresh = candidate.refresh;
    this.expires = candidate.expires;
    this.identity = identity;
    return identity;
  }
  private async getToken(params: Record<string, string>) {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.secret,
        ...params,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok)
      throw new Error('Twitch token exchange failed. Check app credentials and redirect URI.');
    const t = tokenSchema.parse(await res.json());
    this.token = t.access_token;
    this.refresh = t.refresh_token;
    this.expires = Date.now() + t.expires_in * 1000;
  }
  async access() {
    if (!this.token) throw new Error('Connect Twitch first');
    if (Date.now() > this.expires - 60000 && this.refresh)
      await this.getToken({ grant_type: 'refresh_token', refresh_token: this.refresh });
    return this.token!;
  }
  async validate() {
    let token = await this.access();
    let res = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401 && this.refresh) {
      await this.getToken({ grant_type: 'refresh_token', refresh_token: this.refresh });
      token = this.token!;
      res = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `OAuth ${token}` },
        signal: AbortSignal.timeout(10000),
      });
    }
    if (!res.ok) throw new Error('Twitch authorization expired. Reconnect your account.');
    const info = z
      .object({
        client_id: z.string(),
        user_id: z.string(),
        login: z.string(),
        scopes: z.array(z.string()),
      })
      .parse(await res.json());
    if (info.client_id !== this.clientId || !info.scopes.includes('user:read:chat'))
      throw new Error('Required chat permission is missing');
    if (this.identity && this.identity.id !== info.user_id)
      throw new Error('Broadcaster identity changed');
    this.identity = { id: info.user_id, login: info.login, name: info.login };
    return this.identity;
  }
  clear() {
    this.token = null;
    this.refresh = null;
    this.identity = null;
  }
}
