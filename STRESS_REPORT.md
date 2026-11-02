# Frontend polish and backend stress report

Executed October 31, 2026, America/Los_Angeles, on Windows with Node 24.14.1. Raw artifact timestamps use UTC.

## Frontend pass

Retained the IBM Plex Sans / Cinzel typography and charcoal/copper palette. Increased supporting type and label contrast, refined panel emphasis, and moved pending approval above voting results. The approval button fits without scrolling at **1366 × 768**. On mobile, the voting/decision workflow now precedes the illustration.

Added the branded SVG mark/favicon, description metadata, current-page navigation, named icon controls, 44 px navigation targets, a working keyboard skip link, and saving/loading status. Reduced motion remains supported. The approved overlay fits **1280 × 720** without vertical overflow.

Screenshots under `test-results/` were inspected: laptop pending proposal, 390 px mobile controls/settings, and the approved overlay. Browser tests check keyboard focus, target sizes, overflow, and the approval's viewport position.

## Method

The harness starts a **separate server process**, sends real localhost HTTP traffic, and maintains real WebSocket clients. Each run uses temporary **file-backed SQLite in WAL mode**. Neither the working session nor Twitch is used. The temporary database is closed and removed afterward.

Every viewer first votes A, then changes to B in a second wave. Accepted votes remain individually persisted even when presentation updates are coalesced.

## Results

| Metric                                 |    Before |     After |     Heavy |
| -------------------------------------- | --------: | --------: | --------: |
| Vote requests                          |     2,000 |     2,000 |    20,000 |
| Distinct viewers                       |     1,000 |     1,000 |    10,000 |
| Persistent overlays                    |        16 |        16 |        64 |
| HTTP concurrency                       |        48 |        48 |        96 |
| Additional reconnecting clients        |         0 |         0 |        64 |
| Votes / second                         |     156.2 |     956.8 |   1,032.0 |
| Vote phase                             |  12.806 s |   2.090 s |  19.380 s |
| HTTP p50                               | 300.41 ms |  47.28 ms |  90.75 ms |
| HTTP p95                               | 354.64 ms |  61.56 ms | 109.45 ms |
| HTTP p99                               | 393.82 ms |  70.25 ms | 121.19 ms |
| Event-loop p95                         | 349.96 ms |  60.49 ms | 108.07 ms |
| Final server heap                      |  47.5 MiB |  41.6 MiB |  42.2 MiB |
| Final server RSS                       | 177.8 MiB | 170.5 MiB | 289.9 MiB |
| Unexpected errors / invariant failures |         0 |         0 |         0 |

The matched workload improved throughput **6.1×** and reduced p95 latency **82.6%**. These are single-run local measurements, not statistical capacity guarantees. Memory figures are final samples, not peaks.

Raw results: [before](artifacts/stress/before.json), [after](artifacts/stress/after.json), [heavy](artifacts/stress/heavy.json).

## Findings and fixes

1. **Repeated snapshot work:** the server previously read and serialized evidence once per client per vote. It now builds one snapshot and at most one frame per role per broadcast. Vote updates coalesce on a nominal 50 ms timer; close/approval/rollback remain immediate. Unchanged sequences skip fan-out. Under load, event-loop delay can extend the timer beyond 50 ms.
2. **Growing tally cost:** votes previously recounted the entire round. Counts now update from the previous user choice within the same transaction. An independent Map oracle and SQL recount agree after **10,000 changes plus 3,334 duplicate attempts**.
3. **Out-of-order commands:** a delayed earlier command could overwrite a newer choice. Persisted source timestamps now reject older replacements. Migration v2 preserves existing vote rows; existing rows start at timestamp 0 until their first new accepted vote.
4. **Misclassified HTTP errors:** oversized and malformed bodies returned 409. The handler now preserves Fastify's 413/400 responses. These tests failed before the fix and pass afterward.
5. **Unbounded slow-client queue:** clients with more than 1 MiB queued terminate before another snapshot is sent, then can reconnect for current state. The threshold is unit-tested; long-duration slow-network behavior was not soaked.

## Assertions exercised

- Exact latest-user tally and no encounter mutation before approval.
- 32 concurrent closes produce one proposal; stale approval is rejected.
- 64 concurrent approvals produce one state revision and one approval event.
- All overlays converge with nondecreasing sequences and no private event history.
- 32 competing rollbacks produce one compensation and 31 conflicts.
- 64 invalid payloads return 400; 64 anonymous mutations return 401.
- 64 additional overlays reconnect, receive authoritative voting snapshots, and disconnect.
- Invalid credentials and oversized WebSocket payloads close with expected codes; the server survives.
- SQLite v1-to-v2 migration preserves old votes and is repeatable.

## Reproduce

```powershell
npm test
npm run test:e2e
npm run test:stress
```

Default stress profile: 6,000 votes, 24 overlays, 48 concurrent requests. Heavy profile:

```powershell
$env:STRESS_VOTES='20000'
$env:STRESS_PEERS='64'
$env:STRESS_CONCURRENCY='96'
$env:STRESS_CHURN='true'
$env:STRESS_LABEL='heavy-rerun'
npm run test:stress
```

Results go to `artifacts/stress/<label>.json`. Run profiles serially on an otherwise idle machine for cleaner comparisons.

## Final validation and limits

**26 unit/integration tests and 3 browser tests pass.** Type checking, production build, and formatting checks pass.

This is a short synthetic local workload. It does not verify real Twitch delivery, hours-long outages, power-loss durability, multi-process deployment, or public-internet production capacity. The owner deferred Twitch connection; that manual gate remains open. The system still intentionally uses one authoritative process and synchronous SQLite writes.
