# RIFT submission draft

**Status: prepared text only; not uploaded or submitted.** Verify current official competition rules and deadline before submitting. The supplied planning brief specifies November 2, 2026 at 2:00 PM Pacific Standard Time; this repository does not independently establish eligibility.

## Name and tagline

RIFT — The Audience Controls the World

Turn Twitch chat into a live encounter director.

## Inspiration

Interactive adventures thrive on audience participation, but a streamer must also run the game, track resources, interpret chat, and keep the story moving. RIFT explores whether audience decisions can become coherent encounters without taking control away from the host. This is a product hypothesis; streamer research has not yet validated it.

## What it does

Viewers vote on three Ruined Temple outcomes using simple Twitch chat commands. An original deterministic encounter engine checks health, level, active hazards, cooldowns, and allowed variants. It proposes a bounded result with an inspectable calculation. The broadcaster approves or rejects the consequence; approval updates the OBS browser-source scene and an audit ledger. A compensating rollback can undo the latest approval while preserving evidence.

## How it was built

React, TypeScript, Vite and Tailwind provide the control room and overlay. Fastify owns state and authorization. Twitch uses server-side OAuth and EventSub WebSockets. SQLite transactions persist votes, proposals, approvals, and evidence. Native WebSockets distribute authoritative snapshots. Vitest checks rules, persistence, authorization, and mocked Twitch protocol behavior; Playwright exercises the full local loop and mobile interface.

## Codex usage

Codex was used in this primary build chat to interpret the specification, implement the software, consult Twitch documentation, run checks, investigate failures, refine the interface, and prepare documentation. Include the actual session identifier and genuine development footage before submission.

## Challenges and lessons

The important boundary is proposal versus committed state. RIFT keeps audience input independent from host authorization and uses revisions and transactions to prevent stale or repeated commands from changing state twice. Another lesson is that reconnecting does not recover missing Twitch messages: the UI must make the gap visible. Rehearsal and live provenance must also stay distinct.

## Verification language to update before publishing

Current verified statement: “The local rehearsal loop, transactional rules, and browser overlay are tested. The Twitch integration is implemented and provider behavior is covered with mocks.”

Only replace this with a live-integration claim after a real Twitch event and OBS recording pass the manual gate in TEST_REPORT.md. Do not claim a production deployment, streamer impact study, or successful submission without evidence.

## Required external artifacts

- [ ] Public source repository URL.
- [ ] Public or unlisted processed demo video under three minutes.
- [ ] Actual Codex session ID and development footage.
- [ ] Real Twitch-to-OBS proof.
- [ ] Free testing access and precise setup instructions for judges.
- [ ] Review final eligibility and official submission fields.
- [ ] Submit and verify the platform reports **Submitted**, not Draft.

These steps require the owner's accounts and real recording work. They were not performed by this local build.
