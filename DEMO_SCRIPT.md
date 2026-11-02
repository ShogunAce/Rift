# RIFT demo script

Target length: **2 minutes 50 seconds**. This is a recording script, not a claim that footage exists. Do not substitute rehearsal for the required real Twitch evidence.

## Two ways to run it

### Rehearsal (no Twitch needed)

Use this to practice, or to show the product with simulated votes.

```powershell
npm run demo
```

It starts a fresh in-memory world on its own ports and ignores the Twitch settings in `.env`, so it cannot touch a live server or its database. Open **http://localhost:5180/**. Restart the command for a clean slate.

Simulated votes stay labeled on screen. Keep those labels visible in any footage.

### Live (real Twitch chat)

1. Make sure `APP_ORIGIN` and `TWITCH_REDIRECT_URI` in `.env` use the address you will actually open, and that the redirect is registered in the Twitch developer console. Quick tunnel addresses change when the tunnel restarts.
2. Build, then restart the server so it runs the latest code:

   ```powershell
   npm run build
   npm start
   ```

3. Open `APP_ORIGIN` itself, not `localhost`. The server refuses control requests from any other address.
4. Click **Open RIFT → Connect Twitch** and authorize with the broadcaster account. You return to the control room when it finishes.

## Run sheet

| Step | Do this                                                                                               | You should see                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1    | Open the landing page and try the hero, then **Open RIFT**                                            | Looping scene, then the control room                                                 |
| 2    | **Enter rehearsal** (or **Connect Twitch** when live)                                                 | The welcome banner disappears and **Start voting** lights up                         |
| 3    | **Stream overlay → Copy overlay URL → Open browser preview**                                          | The overlay in its own window. In OBS, use a 1280 × 720 browser source with that URL |
| 4    | Back in **Control room**, set party level 3, health 70, 60 seconds                                    | Threat budget will be 51                                                             |
| 5    | **Start voting**                                                                                      | Timer runs, the panel glows, and the overlay says **VOTING OPEN**                    |
| 6    | Rehearsal: click **!rift a** a few times with different Viewer IDs. Live: have viewers type `!rift a` | Bars move on both screens, and the leading option highlights                         |
| 7    | **Close voting & calculate**                                                                          | **Your decision** jumps to the top: Stone Golem, Fractured guardian, 52 → 51 → 35    |
| 8    | **See how RIFT worked it out**                                                                        | The exact sums                                                                       |
| 9    | **Unleash encounter**                                                                                 | The scene tears open on the golem on both screens. Threat reads 35 / 51              |
| 10   | **Event ledger**, then expand the newest rows                                                         | The vote, proposal and approval on the record                                        |
| 11   | **Control room → Roll back**                                                                          | The overlay returns to the temple, and the ledger keeps the record                   |

**Handy to know while presenting**

- **Quote the budget from Your decision.** The threat gauge reads 0 / 60 until something is approved, then shows that encounter's cost against its budget.
- **Roll back only undoes the latest approval,** and starting a new round closes that window.
- **Reset voting** only appears while voting is open or a proposal is waiting. It clears the votes and restarts the timer.
- **Golem on cooldown?** Voting the same fate twice in a row comes back as "A moment of respite". That is the rules working. Vote for the vault, or restart `npm run demo`.
- **Closing a round with no votes** cancels it without inventing a result.

## Preparation for the recording

- Configure Twitch following the README. Sign in as the broadcaster and confirm the status reads **Twitch connected**.
- Keep the control room, the OBS overlay and a real Twitch viewer's chat visible for capture.
- Arrange for real viewers to vote; do not fabricate counts. If only one viewer is available, show the real one-vote result honestly.
- Record development evidence in this Codex chat: implementation, a failing check/fix, and final test output. Capture the actual session ID using the app's `/status` workflow if available; do not invent an ID.
- Hide `.env`, developer secrets, session cookies, and the private overlay URL during recording.

## Shot list and narration

| Time      | Picture                                                | Suggested narration                                                                                                                                                      |
| --------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:15 | Landing hero, then control room and Twitch chat        | “Running an adventure and reading chat is already two jobs. Turning audience ideas into a playable encounter adds a third.”                                              |
| 0:15–0:35 | Twitch connected status, Ruined Temple, OBS overlay    | “RIFT turns chat into an encounter director. Chat gets the vote. You keep the veto.”                                                                                     |
| 0:35–1:00 | Start voting; real viewer sends `!rift a`; bar changes | “One viewer, one vote. A new vote replaces the old one, and duplicate deliveries can't inflate the count.”                                                               |
| 1:00–1:30 | Close vote; open “See how RIFT worked it out”          | “The golem costs 52. This party's threat budget is 51 under our own scoring rules. RIFT picks a defined 35-point version and shows why. Nothing has changed yet.”        |
| 1:30–1:55 | Click Unleash; the overlay tears open; threat fills    | “Only the broadcaster can approve. It commits once, and every connected screen updates.”                                                                                 |
| 1:55–2:15 | Expand ledger vote, proposal and approval              | “Here is the real Twitch delivery, the tally, the sums and the approved result.”                                                                                         |
| 2:15–2:40 | Codex implementation/test footage                      | “Codex built the integration, deterministic rules, transactional persistence, interface, and tests. Automated checks cover the failure paths as well as the happy path.” |
| 2:40–2:50 | Roll back and final scene                              | “Chaos from the audience. Boundaries from the rules. The final call stays with you.”                                                                                     |

## Capture checklist

- [ ] Genuine broadcaster OAuth completed.
- [ ] At least one real `channel.chat.message` event affects a round.
- [ ] OBS updates after approval without refreshing.
- [ ] Ledger ties source event to proposal and approval.
- [ ] Development footage is from the actual Codex session.
- [ ] No fabricated audience metrics, secrets, or private URLs shown.
- [ ] Video is under three minutes and has readable text at 720p.
- [ ] Public or unlisted upload is processed and independently playable.

Rehearsal is useful for practicing camera movements and checking timing. Its simulated-votes label must remain visible when rehearsal footage is used.
