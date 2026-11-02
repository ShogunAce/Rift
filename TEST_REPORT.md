# Verification report

Executed October 31, 2026 on Windows with Node.js 24.14.1. Results refer to the local build, not a deployed service or a live Twitch stream.

## Automated results

| Check                                        | Actual result                            |
| -------------------------------------------- | ---------------------------------------- |
| `npm test`                                   | **26 passed**, 8 test files              |
| `npm run typecheck`                          | Passed                                   |
| `npm run build`                              | Passed; production Vite bundle generated |
| `npm run test:e2e`                           | **3 passed**, Chromium                   |
| `npm run lint`                               | Passed; Prettier consistency check       |
| npm dependency audit after patched overrides | **0 vulnerabilities**                    |

### Domain and storage

- Exact normalized command parsing and rejection of unrelated text.
- Deterministic, seeded ties; zero votes produce no winner.
- Exact budget formula and safe variant selection, including level 3 / health 70 → budget 51 → fractured golem cost 35.
- Budget and nonnegative-resource checks across 20 levels × 21 health values × 3 choices.
- Proposals preserve committed state until approval.
- Cooldown and incompatible-effect fallback; effect expiry.
- One latest vote per user, replacement, independent chat/delivery deduplication.
- Server deadline and source-mode enforcement; delayed pre-round timestamps rejected.
- Overlapping rounds rejected; empty rounds cancelled.
- Authorized revision-checked approval, idempotent repeated approval, stale-revision rejection.
- Rejection leaves gameplay unchanged.
- Compensating rollback restores gameplay with a newer revision and an appended ledger event.
- Database close/reopen preserves committed state, evidence, deduplication keys, and rollback availability.

### API and realtime

- Anonymous mutations rejected; wrong request origin rejected.
- Invalid OAuth state rejected.
- Invalid overlay credentials rejected.
- Overlay credential cannot authorize mutation APIs.
- Overlay WebSocket uses the restricted projection even with a host cookie: no private event history, round/proposal IDs, or tie seed.
- Server timer closes an expired round; overlay reconnect gets the latest authoritative snapshot.
- Logout invalidates the host session.

### Twitch provider contract — mocked, not live

- Authorization-code token exchange and broadcaster/scope validation.
- Expiring-token refresh and invalid client identity rejection.
- Session welcome produces the correct `channel.chat.message` v1 subscription request.
- “Connected” follows successful subscription creation.
- Notifications retain viewer, chat-message, delivery, and timestamp identity.
- Twitch-directed reconnect migrates without issuing a duplicate subscription.
- Missing keepalive disconnects and reconnects; possible-lost-votes warning survives reconnection.
- Revocation stops reconnect attempts.

### Real-browser checks

1. Enter rehearsal → start round → synthetic vote → close → inspect pending state → approve → separate browser overlay updates → roll back → overlay restores state.
2. 390 px mobile viewport: signed-out controls, truthful disconnected status, settings navigation, and no horizontal overflow.

Browser tests now start isolated services on ports 5174/3002 with an in-memory database. They do not modify the streamer's `data/rift.sqlite`.

Screenshots are generated under `test-results/`: control room, approved overlay, and mobile settings. These were visually inspected. The artwork and fonts are local assets. An initial missing-browser failure was resolved by installing Chromium; an exact-text locator in the mobile test was corrected to account for the version label in the same status container. The final browser suite passed.

## Manual release gates still open

The owner explicitly deferred Twitch connection until after the local build. None of the following has been claimed as complete:

- [ ] Register/configure a real Twitch developer application.
- [ ] Finish OAuth using the real broadcaster account and confirm identity.
- [ ] Receive a genuine EventSub chat event and verify its source IDs in the ledger.
- [ ] Repeat the replacement/duplicate behavior with real viewers or a Twitch testing environment.
- [ ] Approve a real Twitch-driven proposal and observe it inside an actual OBS browser source.
- [ ] Interrupt the real Twitch connection, verify the warning, and reconnect.
- [ ] Test real provider token expiry/refresh and revocation.
- [ ] Record a genuine Twitch-to-OBS demonstration and actual Codex development footage.
- [ ] Validate usability with a streamer; validate the original balance heuristic in play.
- [ ] Publish a source repository, upload the demo, record the actual Codex session ID, and verify submission status.

## Reproduce

```powershell
npm ci
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run lint
```

Expected runtime notices: Node 24 marks built-in SQLite experimental. Playwright may report conflicting color-output environment flags. Neither notice was a failed assertion. Tests use mocked provider calls where stated; passing them is not evidence of real Twitch connectivity.

## Frontend and stress follow-up

See [STRESS_REPORT.md](STRESS_REPORT.md) for the frontend refinements, measured before/after load tests, 20,000-vote workload, regression fixes, and reproduction commands.
