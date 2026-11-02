# RIFT demo recording plan

Target length: **2 minutes 50 seconds**. This is a recording script, not a claim that footage exists. Do not substitute rehearsal for the required real Twitch evidence.

## Preparation

- Configure Twitch following README. Sign in as the broadcaster and verify the EventSub subscription.
- Add the overlay URL as a 1280×720 OBS browser source. Keep the control room and a real Twitch viewer chat visible for capture.
- Set party level 3, health 70, and voting duration 60 seconds. The Stone Golem's 52-point base exceeds the 51-point budget, making the weaker variant easy to explain.
- Arrange for real viewers to vote; do not fabricate counts. If only one viewer is available, show the real one-vote result honestly.
- Record development evidence in this Codex chat: implementation, a failing check/fix, and final test output. Capture the actual session ID using the app's `/status` workflow if available; do not invent an ID.
- Hide `.env`, developer secrets, session cookies, and the private overlay URL during recording.

## Shot list and narration

| Time      | Picture                                                | Suggested narration                                                                                                                                                           |
| --------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:15 | Control room and Twitch chat                           | “Running an adventure and reading chat is already two jobs. Turning audience ideas into a playable encounter adds a third.”                                                   |
| 0:15–0:35 | Verified Twitch status, Ruined Temple, OBS source      | “RIFT turns chat into an encounter director. The audience chooses. The keeper stays in control.”                                                                              |
| 0:35–1:00 | Start voting; real viewer sends `!rift a`; bar changes | “Each viewer has one current vote. Changing their command replaces it. Duplicate deliveries cannot inflate the count.”                                                        |
| 1:00–1:30 | Close vote; expand calculation                         | “The golem costs 52. This party can safely take 51 under our original heuristic. RIFT selects a defined 35-point variant and explains why. It has not changed the world yet.” |
| 1:30–1:55 | Click Unleash; show OBS reveal and threat              | “Only the broadcaster can approve. The state commits once, and every connected screen updates.”                                                                               |
| 1:55–2:15 | Expand ledger vote, proposal and approval              | “Here is the real Twitch delivery, the tally, the rule calculation, and the authorized result.”                                                                               |
| 2:15–2:40 | Codex implementation/test footage                      | “Codex built the integration, deterministic rules, transactional persistence, interface, and tests. Automated checks cover the failure paths as well as the happy path.”      |
| 2:40–2:50 | Rollback and final scene                               | “Chaos from the audience. Boundaries from the engine. The final call stays with the streamer.”                                                                                |

## Capture checklist

- [ ] Genuine broadcaster OAuth completed.
- [ ] At least one real `channel.chat.message` event affects a round.
- [ ] OBS updates after approval without refreshing.
- [ ] Ledger ties source event to proposal and approval.
- [ ] Development footage is from the actual Codex session.
- [ ] No fabricated audience metrics, secrets, or private URLs shown.
- [ ] Video is under three minutes and has readable text at 720p.
- [ ] Public or unlisted upload is processed and independently playable.

Rehearsal is useful for practicing camera movements and checking timing. Its synthetic-input label must remain visible when rehearsal footage is used.
