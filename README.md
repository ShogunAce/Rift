# RIFT

**The audience controls the world. The streamer survives it.**

A local-first Twitch encounter director. Viewers vote with `!rift a`, `!rift b`, or `!rift c`; a deterministic engine proposes a bounded consequence; the broadcaster approves; the OBS browser source updates and the ledger records the result.

## Current status

The complete local Ruined Temple loop is implemented and verified in rehearsal, including a separate real-time overlay. Twitch OAuth and EventSub are implemented and covered by mocked-provider protocol tests. **Real-account Twitch authorization, live chat delivery, and capture inside OBS remain unverified.** The owner chose to connect Twitch later. Rehearsal votes are explicitly labeled simulated. No submission or live demo claim is implied.

## Quick start

Requires **Node.js 24+** (uses built-in `node:sqlite`) and npm. No OpenAI API key, external database, or paid service is required.

```powershell
npm ci
npm run demo
```

Open **http://localhost:5180/** for the landing page, or **http://localhost:5180/app** for the control room. `npm run demo` is a one-command rehearsal: a fresh in-memory world on its own ports. It ignores your `.env`, so it cannot touch a live server or its database. See [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for a click-by-click run sheet.

For development against your own `.env`, use `npm run dev` and open `APP_ORIGIN`. The server refuses control requests from any other address, so with the default settings use `http://localhost:5173`, not `127.0.0.1`.

1. Click **Enter rehearsal**.
2. Set the party level, health, and voting duration. Click **Start voting**.
3. Send a simulated vote with the rehearsal buttons. Change the viewer ID to simulate another viewer; reuse the ID to change that viewer's vote.
4. Click **Close voting & calculate**, or wait for the server deadline.
5. Open **See how RIFT worked it out**, then **Unleash encounter** or **Reject**.
6. Open **Stream overlay**, copy its private URL, and open it in another browser window. Approved outcomes update without reloading.
7. Use **Roll back** to compensate the most recent approval. Starting another round closes that rollback window.

At level 3 and 70% health, the budget is 51. The Stone Golem's base cost is 52, so the engine chooses its defined 35-point fractured variant. Empty rounds cancel without inventing votes.

## Connect a real Twitch account

1. Sign in to the [Twitch developer console](https://dev.twitch.tv/console/apps). Create an application using the authorization-code/confidential-client flow. Twitch may require account two-factor authentication.
2. Register this OAuth redirect URI **exactly**:

   `http://localhost:5173/api/auth/twitch/callback`

3. In `.env`, set `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `TWITCH_REDIRECT_URI`. Keep `APP_ORIGIN=http://localhost:5173` for development. Never commit `.env` or paste secrets into chat.
4. Restart `npm run dev`. Open **Settings & connection → Connect Twitch** and authorize `user:read:chat` using the broadcaster account.
5. Wait for **Twitch connected**. This status is set only after an EventSub session welcome and successful subscription creation. A login alone is not reported as connected.
6. Start a round. In that broadcaster's Twitch chat, send `!rift a` from a real viewer account. Inspect the ledger's chat message ID, EventSub delivery ID, user ID, and `mode: live`.
7. Close voting, approve the proposal, and verify the overlay changes. Follow the live verification checklist in [TEST_REPORT.md](TEST_REPORT.md).

This MVP uses the broadcaster's own user token and subscribes to `channel.chat.message` v1 with the same broadcaster and authorized user IDs. It is not a multi-channel bot. Tokens stay in server memory, refresh automatically, and are validated hourly. Restarting the server requires signing in again; game state and evidence persist in SQLite.

Switching between rehearsal and live, or to a different broadcaster, resets gameplay state, retains labeled audit history, and rotates the overlay credential. Copy a new overlay URL after switching. This prevents rehearsal consequences from appearing as live gameplay.

Official integration references: [authorization code grant](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow), [EventSub WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [chat message subscription](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelchatmessage), [token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/).

## OBS browser source

1. In RIFT, open **Stream overlay → Copy overlay URL**.
2. In OBS, add a **Browser** source and paste the URL, including its `#` fragment.
3. Use **1280 × 720**, 30 FPS. RIFT supplies the scene, choices, approved reveal, round status, and threat meter.
4. Keep the URL private. It is a random read-only capability, not a broadcaster login. The fragment is not sent in HTTP URLs; the client presents it in an authorization header and WebSocket authentication message.
5. The overlay receives an authoritative snapshot when it reconnects. **SYNC LOST** means the screen is stale. A Twitch disconnect is reported separately from the local overlay connection.

The current scene is an opaque full-frame encounter layout. Place it as an intermission/encounter scene or resize it as a source in your stream composition. It is not a transparent lower-third overlay.

## Production build on the same machine

```powershell
npm run build
```

Set `APP_ORIGIN=http://localhost:3001` and `TWITCH_REDIRECT_URI=http://localhost:3001/api/auth/twitch/callback` in `.env`, register that redirect in Twitch, then:

```powershell
npm start
```

Fastify serves the built app and API on port 3001. The default host is loopback only. This is a single-operator local application, not a public multi-tenant deployment. Before exposing it publicly, use HTTPS, set the exact public origin, disable rehearsal with `ALLOW_REHEARSAL=false`, and add deployment-specific access/rate controls. Secure cookies are enabled for HTTPS origins.

## Commands

| Command                           | Purpose                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`                     | Vite 5173 and Fastify 3001 with reload                                               |
| `npm run typecheck`               | Strict TypeScript checks                                                             |
| `npm test`                        | Domain, database/API, and mocked Twitch protocol tests                               |
| `npx playwright install chromium` | Install browser test runtime                                                         |
| `npm run test:e2e`                | Browser flow and mobile tests on isolated ports 5174/3002 with an in-memory database |
| `npm run build`                   | Typecheck and production client build                                                |
| `npm start`                       | Serve the built app and API                                                          |
| `npm run lint`                    | Check formatting consistency                                                         |
| `npm run format`                  | Format source and documentation                                                      |

## Data and recovery

`data/rift.sqlite` is created on first run. SQLite uses WAL and transactional schema migrations. The database holds game state, rounds, latest user votes, deduplication IDs, read-only overlay credential, and append-only evidence; it does not hold Twitch OAuth tokens. Back up the database with the app stopped (or use a SQLite-aware backup). Do not publish the database.

One server process owns one active workspace. Browser updates use an increasing event sequence and game revision. Writes require a server session, exact request origin, validated payload, and—where relevant—an expected state revision. Duplicate approvals cannot apply twice. Rollback adds a compensating event rather than deleting history.

Network loss cannot replay missing Twitch chat. RIFT reconnects/resubscribes and preserves a possible-vote-gap warning in the connection detail and ledger. If accurate participation matters, reject that round and start another. Exact command parsing means unrelated or malformed chat is ignored; RIFT never renders raw chat text as HTML. Advanced moderation and retroactive message-deletion handling are outside this MVP.

## Scope and limitations

- Ruined Temple is the only template, deliberately following the P0-first build directive. Forest and Siege Gate are deferred until real Twitch validation passes.
- The encounter formula is an original heuristic, not D&D rules or validated game balance. No automated damage simulation or optional narrative AI is included.
- Sessions and OAuth tokens are memory-only; sign in again after restart. A 12-hour host session expires even if the Twitch token remains valid.
- Audit history is fully retained in SQLite; the UI displays the latest 60 events. There is no archival/retention UI.
- Rehearsal is available without Twitch only on this locally bound service. Never mistake it for broadcaster authorization in a public deployment.
- The illustration is original SVG, and the specified IBM Plex Sans / Cinzel fonts are bundled locally through Fontsource. No remote image or font request is needed at runtime.
- Built-in SQLite is still marked experimental by the tested Node runtime. Its warning is expected; use the pinned lockfile and Node 24+.
- Live Twitch proof, an OBS recording, streamer usability research, a public repository, a demo upload, and Devpost submission still require real-world completion. See [DEMO_SCRIPT.md](DEMO_SCRIPT.md) and [SUBMISSION.md](SUBMISSION.md).

See [ARCHITECTURE.md](ARCHITECTURE.md) for system boundaries and [TEST_REPORT.md](TEST_REPORT.md) for actual verification results.

## Stress testing

Run `npm run test:stress` for an isolated file-backed HTTP/WebSocket load test. It never uses the working session database. See [STRESS_REPORT.md](STRESS_REPORT.md) for measured capacity, findings, configurable profiles, and limitations.
