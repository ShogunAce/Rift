import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { migrate } from './migrations.js';
import { initialState, propose, applyProposal } from '../domain/encounter.js';
import { parseVote, winner } from '../domain/voting.js';
import { newCampaign } from '../domain/campaign.js';
import type {
  GameState,
  Round,
  Snapshot,
  LedgerEvent,
} from '../../../../packages/shared/src/contracts.js';
export class Repository {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    migrate(this.db);
    if (!this.get('state')) this.put('state', initialState());
  }
  get<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM kv WHERE key=?').get(key) as
      { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }
  put(key: string, value: unknown) {
    this.db
      .prepare('INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, JSON.stringify(value));
  }
  event(type: string, detail: Record<string, unknown>) {
    this.db
      .prepare('INSERT INTO events(at,type,detail) VALUES(?,?,?)')
      .run(new Date().toISOString(), type, JSON.stringify(detail));
  }
  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  state() {
    const state = this.get<GameState>('state')!;
    return { ...state, campaign: state.campaign ?? newCampaign() };
  }
  round() {
    return this.get<Round>('round');
  }
  snapshot(): Omit<Snapshot, 'connection' | 'mode'> {
    const rows = this.db
      .prepare('SELECT * FROM events ORDER BY id DESC LIMIT 60')
      .all() as unknown as (Omit<LedgerEvent, 'detail'> & { detail: string })[];
    return {
      sequence: rows[0]?.id ?? 0,
      state: this.state(),
      round: this.round(),
      events: rows.map((r) => ({ ...r, detail: JSON.parse(r.detail) })),
      canRollback: !!this.get('undo'),
    };
  }
  start(level: number, health: number, duration: number, mode: 'live' | 'rehearsal') {
    return this.tx(() => {
      if (
        !Number.isInteger(level) ||
        level < 1 ||
        level > 20 ||
        !Number.isFinite(health) ||
        health < 0 ||
        health > 100 ||
        !Number.isInteger(duration) ||
        duration < 10 ||
        duration > 300
      )
        throw new Error('Invalid round settings');
      const old = this.round();
      if (old && ['voting', 'proposed'].includes(old.status))
        throw new Error('Resolve the current round first');
      const s = this.state();
      s.round++;
      s.revision++;
      s.partyLevel = level;
      s.partyHealth = health;
      s.activeEffects = s.activeEffects.filter((e) => e.expires > s.round);
      s.cooldowns = Object.fromEntries(
        Object.entries(s.cooldowns).filter(([, expires]) => expires > s.round),
      );
      s.threat = 0;
      this.put('state', s);
      this.put('undo', null);
      const r: Round = {
        id: randomUUID(),
        openedAt: Date.now(),
        number: s.round,
        deadline: Date.now() + duration * 1000,
        status: 'voting',
        seed: randomUUID(),
        tally: { a: 0, b: 0, c: 0 },
        proposal: null,
        mode,
      };
      this.put('round', r);
      this.event('round.opened', { roundId: r.id, mode, deadline: r.deadline, seed: r.seed });
      return r;
    });
  }
  vote(
    id: string,
    user: string,
    text: string,
    mode: 'live' | 'rehearsal',
    deliveryId = id,
    timestamp = Date.now(),
  ) {
    return this.tx(() => {
      const r = this.round();
      const choice = parseVote(text);
      if (
        !choice ||
        !r ||
        r.status !== 'voting' ||
        r.pausedAt !== undefined ||
        r.pausedWindows?.some((window) => timestamp >= window.start && timestamp < window.end) ||
        Date.now() >= r.deadline ||
        r.mode !== mode ||
        !Number.isFinite(timestamp) ||
        timestamp < (r.openedAt ?? 0) ||
        timestamp >= r.deadline
      )
        return false;
      if (this.db.prepare('SELECT id FROM deliveries WHERE id IN (?,?)').get(id, deliveryId))
        return false;
      const previous = this.db
        .prepare('SELECT choice,source_timestamp FROM votes WHERE round=? AND user=?')
        .get(r.id, user) as { choice: 'a' | 'b' | 'c'; source_timestamp: number } | undefined;
      if (previous && timestamp < previous.source_timestamp) return false;
      const inserted = this.db.prepare('INSERT OR IGNORE INTO deliveries VALUES(?)').run(id);
      if (!inserted.changes) return false;
      this.db.prepare('INSERT OR IGNORE INTO deliveries VALUES(?)').run(deliveryId);
      this.db
        .prepare(
          'INSERT INTO votes(round,user,choice,source,source_timestamp) VALUES(?,?,?,?,?) ON CONFLICT(round,user) DO UPDATE SET choice=excluded.choice,source=excluded.source,source_timestamp=excluded.source_timestamp',
        )
        .run(r.id, user, choice, id, timestamp);
      // Maintain counts in the same transaction as the latest-user row: O(1) per vote.
      if (previous) r.tally[previous.choice]--;
      r.tally[choice]++;
      this.put('round', r);
      this.event('vote.accepted', {
        roundId: r.id,
        sourceMessageId: id,
        eventSubMessageId: deliveryId,
        sourceTimestamp: timestamp,
        userId: user,
        choice,
        mode,
        tally: r.tally,
      });
      return true;
    });
  }
  close(id: string) {
    return this.tx(() => {
      const r = this.round();
      if (!r || r.id !== id) throw new Error('Round not found');
      if (r.status !== 'voting') return r;
      if (r.pausedAt !== undefined) throw new Error('Resume voting before closing the round');
      const choice = winner(r.tally, r.seed);
      r.status = choice ? 'proposed' : 'cancelled';
      r.proposal = choice ? propose(this.state(), choice, randomUUID()) : null;
      this.put('round', r);
      this.event(choice ? 'proposal.created' : 'round.cancelled', {
        roundId: r.id,
        tally: r.tally,
        seed: r.seed,
        proposal: r.proposal,
        reason: choice ? undefined : 'No audience votes',
      });
      return r;
    });
  }
  reset(id: string, revision: number, actor: string) {
    return this.tx(() => {
      const previous = this.round();
      const state = this.state();
      if (!previous || previous.id !== id)
        throw new Error('Round changed. Refresh before resetting.');
      if (state.revision !== revision) throw new Error('Stale state revision');
      const duration = Math.max(
        10,
        Math.min(300, Math.round((previous.deadline - previous.openedAt) / 1000)),
      );
      const openedAt = Date.now();
      const next: Round = {
        ...previous,
        id: randomUUID(),
        openedAt,
        deadline: openedAt + duration * 1000,
        status: 'voting',
        seed: randomUUID(),
        tally: { a: 0, b: 0, c: 0 },
        proposal: null,
        pausedAt: undefined,
        pausedWindows: [],
      };
      this.put('state', { ...state, revision: state.revision + 1 });
      this.put('round', next);
      this.put('undo', null);
      this.event('round.reset', {
        actor,
        previousRoundId: previous.id,
        previousStatus: previous.status,
        previousTally: previous.tally,
        discardedProposalId: previous.proposal?.status === 'pending' ? previous.proposal.id : null,
        roundId: next.id,
        mode: next.mode,
        openedAt,
        deadline: next.deadline,
        seed: next.seed,
        revision: state.revision + 1,
      });
      return next;
    });
  }
  decide(id: string, revision: number, approve: boolean, actor: string) {
    return this.tx(() => {
      const r = this.round();
      const p = r?.proposal;
      if (!r || !p || p.id !== id) throw new Error('Proposal not found');
      if (p.status === 'approved' && approve) return this.state();
      if (p.status !== 'pending') throw new Error('Proposal already resolved');
      if (revision !== this.state().revision || p.expectedRevision !== revision)
        throw new Error('Stale state revision');
      if (approve) {
        if (!p.outcome) throw new Error('Reset voting to preview the upgraded encounter rules');
        const before = this.state();
        const after = applyProposal(before, p);
        this.put('state', after);
        this.put('undo', { before, appliedRevision: after.revision, proposalId: id });
      }
      p.status = approve ? 'approved' : 'rejected';
      r.status = p.status;
      this.put('round', r);
      this.event(approve ? 'encounter.approved' : 'encounter.rejected', {
        proposalId: id,
        actor,
        state: this.state(),
      });
      return this.state();
    });
  }
  controlRound(id: string, revision: number, action: 'pause' | 'resume' | 'cancel', actor: string) {
    return this.tx(() => {
      const r = this.round();
      const s = this.state();
      if (!r || r.id !== id) throw new Error('Round not found');
      if (s.revision !== revision) throw new Error('Stale state revision');
      if (action === 'cancel') {
        if (!['voting', 'proposed'].includes(r.status)) throw new Error('Round already resolved');
        r.status = 'cancelled';
        if (r.proposal) r.proposal.status = 'rejected';
        delete r.pausedAt;
      } else {
        if (r.status !== 'voting') throw new Error('Voting is not open');
        if (action === 'pause') {
          if (r.pausedAt !== undefined || Date.now() >= r.deadline)
            throw new Error('Voting cannot be paused');
          r.pausedAt = Date.now();
        } else {
          if (r.pausedAt === undefined) throw new Error('Voting is not paused');
          const now = Date.now();
          r.deadline += now - r.pausedAt;
          r.pausedWindows = [...(r.pausedWindows ?? []), { start: r.pausedAt, end: now }];
          delete r.pausedAt;
        }
      }
      this.put('state', { ...s, revision: s.revision + 1 });
      this.put('round', r);
      this.put('undo', null);
      this.event(`round.${action}`, { actor, roundId: id, deadline: r.deadline });
      return r;
    });
  }
  recover(revision: number, action: 'potion' | 'rest', actor: string) {
    return this.tx(() => {
      const s = this.state();
      if (s.revision !== revision) throw new Error('Stale state revision');
      if (['voting', 'proposed'].includes(this.round()?.status ?? ''))
        throw new Error('Resolve voting before recovery');
      if (s.partyHealth >= s.maxPartyHealth) throw new Error('Party health is already full');
      const campaign = { ...s.campaign! };
      if (action === 'potion') {
        if (campaign.potions < 1) throw new Error('No potions available');
        campaign.potions--;
      } else {
        if (campaign.gold < 10) throw new Error('Rest costs 10 gold');
        campaign.gold -= 10;
      }
      const after = {
        ...s,
        campaign,
        partyHealth: Math.min(s.maxPartyHealth, s.partyHealth + (action === 'potion' ? 25 : 40)),
        revision: s.revision + 1,
      };
      this.put('state', after);
      this.put('undo', null);
      this.event('party.recovered', { actor, action, state: after });
      return after;
    });
  }
  rollback(revision: number, actor: string) {
    return this.tx(() => {
      const undo = this.get<{ before: GameState; appliedRevision: number; proposalId: string }>(
        'undo',
      );
      const s = this.state();
      if (!undo || revision !== s.revision || undo.appliedRevision !== s.revision)
        throw new Error('No current transition to roll back');
      this.put('state', { ...undo.before, revision: s.revision + 1 });
      this.put('undo', null);
      const r = this.round();
      if (r) {
        r.status = 'cancelled';
        this.put('round', r);
      }
      this.event('encounter.rolled_back', {
        actor,
        proposalId: undo.proposalId,
        state: this.state(),
      });
    });
  }
}
