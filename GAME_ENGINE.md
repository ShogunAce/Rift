# Game engine upgrade

The frontend source is unchanged. Encounters now resolve automatically when the host approves the existing proposal; this is a turn-based resolution engine, not animated combat. The first proposal explanation lists damage, healing, gold, XP, armor, potions, and emergency retreat before approval. Existing health, level, effects, and ledger displays reflect the result.

## Rules

- Stone Golem: damage is half the threat cost, rounded up, minus armor. Victory grants the threat cost in XP and half the cost in gold, rounded up.
- Cursed Fog: damage is one-third of threat cost, rounded up, minus half armor rounded down. Victory grants the cost in XP and one-third in gold, rounded up. Fog and golem effects cannot overlap, in either order.
- Ancient Vault: restores up to 15 health, grants twice the cost in gold, 10 XP, up to 2 armor (cap 10), and one potion (inventory cap 3).
- Respite: restores up to 12 health, grants no rewards, and does not extend the blocked choice's cooldown. Effects and cooldowns expire by round number, not wall time.
- A lethal encounter triggers an emergency retreat to 25 health. It consumes a potion if available; otherwise it costs up to 15 existing gold. It grants no victory rewards or XP. Damage never takes health below zero.
- Campaigns begin with one potion. Leveling costs current level × 40 XP; leftover XP carries over, with a level cap of 20. Health never exceeds 100.
- Approval commits consequences once. Rejection changes no party stats. Rollback restores health, level, inventory, XP, gold, armor, effects, and cooldowns together. Starting/resetting voting or using another host action clears the prior undo checkpoint.
- The existing health and level inputs remain explicit host overrides. Their values synchronize after each state revision, so ordinary successive rounds carry the resolved stats forward.

## Host API additions

All routes require the existing host session, matching Origin, and a JSON `expectedRevision` equal to the latest snapshot's state revision. Conflicts return 409; malformed requests return 400. These controls have no new frontend buttons in this pass.

| POST route               | Additional fields              | Behavior                                                                                                                                                        |
| ------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/rounds/:id/pause`  | none                           | Freeze an open, unexpired vote, preserving remaining time.                                                                                                      |
| `/api/rounds/:id/resume` | none                           | Resume with the remaining time. Reject delayed messages timestamped inside any paused interval.                                                                 |
| `/api/rounds/:id/cancel` | none                           | Cancel voting or reject a pending proposal without applying its consequences.                                                                                   |
| `/api/party/recover`     | `action: "potion"` or `"rest"` | Between rounds: spend one potion to restore 25 health, or 10 gold to restore 40. Full-health recovery and insufficient inventory are rejected without spending. |

Campaign fields are additive under `snapshot.state.campaign`. Consequences appear under `round.proposal.outcome`. Pause state is additive on the round; existing frontend countdowns do not display a paused indicator, so pause is intended for API clients until a UI pass is authorized.

## Persistence and compatibility

Existing saves gain default campaign inventory when read; existing health, rounds, votes, ledger, and replay protection remain intact. Already-approved legacy encounters are not retroactively resolved. Pending legacy proposals must be reset so the host can see the new consequences before approving. New campaign state, pause windows, and undo checkpoints persist in the same transactional SQLite store.

The upgrade does not add controls to OBS or animate combat. Twitch authentication remains memory-only: restarting the service requires reconnecting Twitch. The existing HTTPS tunnel must remain running.

## Verification — November 2, 2026

- 38 unit/integration tests passed across 10 files, including a 300-round campaign simulation, inventory bounds, rescue outcomes, cooldown recovery, complete rollback, legacy saves, persisted pause state, delayed paused votes, revision conflicts, and authenticated recovery/control routes.
- All 5 existing Chromium browser regression tests passed with the frontend unchanged.
- Type checking and formatting checks passed.
- Isolated disk-backed load test: 20,000 votes, 10,000 viewers, 64 overlays, 96 concurrent requests, and 64 reconnecting clients. Zero errors, 1,067 votes/second, 105.92 ms p95 request latency. Concurrent approval and rollback remained exactly-once. Full output: `artifacts/stress/campaign-upgrade.json`.
- Existing live Twitch demo success was reported by the user before this upgrade; these new rules were validated locally and still need a live round after reconnecting.
