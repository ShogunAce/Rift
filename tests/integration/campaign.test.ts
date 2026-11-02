import { afterEach, describe, expect, it, vi } from 'vitest';
import { Repository } from '../../apps/server/src/storage/repository';
import { initialState, propose, applyProposal } from '../../apps/server/src/domain/encounter';
import { createApp } from '../../apps/server/src/index';
const stores: Repository[] = [];
const make = () => {
  const db = new Repository(':memory:');
  stores.push(db);
  return db;
};
afterEach(() => {
  stores.forEach((db) => db.db.close());
  stores.length = 0;
  vi.useRealTimers();
});
function approve(db: Repository, choice: 'a' | 'b' | 'c') {
  const s = db.state();
  const r = db.start(s.partyLevel, s.partyHealth, 60, 'rehearsal');
  db.vote(r.id, 'viewer', `!rift ${choice}`, 'rehearsal');
  const p = db.close(r.id).proposal!;
  db.decide(p.id, p.expectedRevision, true, 'host');
  return p;
}
describe('campaign mechanics', () => {
  it('previews deterministic consequences, commits once and rolls back all rewards', () => {
    const db = make();
    const before = db.state();
    const p = approve(db, 'c');
    expect(p.outcome).toMatchObject({ healing: 15, gold: 30, armor: 2, potions: 1 });
    const after = db.state();
    expect(after.partyHealth).toBe(85);
    expect(after.campaign).toMatchObject({ gold: 30, armor: 2, potions: 2, encounters: 1 });
    db.decide(p.id, p.expectedRevision, true, 'host');
    expect(db.state()).toEqual(after);
    db.rollback(after.revision, 'host');
    expect(db.state().campaign).toEqual(before.campaign);
    expect(db.state().partyHealth).toBe(70);
  });
  it('recovers on blocked repeats without extending cooldown or farming rewards', () => {
    const db = make();
    approve(db, 'a');
    const cooldown = db.state().cooldowns.a;
    const campaign = db.state().campaign;
    expect(approve(db, 'a').cost).toBe(0);
    expect(db.state().cooldowns.a).toBe(cooldown);
    expect(db.state().campaign).toEqual(campaign);
    expect(approve(db, 'a').cost).toBeGreaterThan(0);
  });
  it('prevents fog/golem conflicts in both directions and bounds long campaigns', () => {
    const s = initialState();
    s.activeEffects = [{ id: 'b', name: 'Fog', reservation: 8, expires: 2 }];
    expect(propose(s, 'a', 'p').cost).toBe(0);
    const db = make();
    for (let i = 0; i < 300; i++) {
      approve(db, (['a', 'b', 'c'] as const)[i % 3]);
      const state = db.state();
      expect(state.partyHealth).toBeGreaterThan(0);
      expect(state.partyHealth).toBeLessThanOrEqual(100);
      expect(state.campaign!.potions).toBeGreaterThanOrEqual(0);
      expect(state.campaign!.potions).toBeLessThanOrEqual(3);
      expect(state.campaign!.armor).toBeLessThanOrEqual(10);
      expect(state.campaign!.gold).toBeGreaterThanOrEqual(0);
    }
    expect(db.state().partyLevel).toBeGreaterThan(3);
    expect(db.state().partyLevel).toBeLessThanOrEqual(20);
  });
  it('rescues a depleted party without granting victory rewards', () => {
    for (const potions of [0, 1]) {
      const s = initialState();
      s.partyHealth = 1;
      s.campaign!.potions = potions;
      s.campaign!.gold = 20;
      const p = propose(s, 'a', 'p');
      const after = applyProposal(s, p);
      expect(p.outcome!.rescued).toBe(true);
      expect(after.partyHealth).toBe(25);
      expect(after.campaign!.experience).toBe(0);
      expect(after.campaign!.potions).toBe(0);
      expect(after.campaign!.gold).toBe(potions ? 20 : 5);
    }
  });
  it('normalizes legacy saves and refuses unpreviewed legacy approvals', () => {
    const db = make();
    const legacy = initialState();
    delete legacy.campaign;
    db.put('state', legacy);
    expect(db.state().campaign!.potions).toBe(1);
    const r = db.start(3, 70, 60, 'live');
    db.vote('m', 'u', '!rift c', 'live');
    const pending = db.close(r.id);
    delete pending.proposal!.outcome;
    db.put('round', pending);
    expect(() => db.decide(pending.proposal!.id, db.state().revision, true, 'host')).toThrow(
      'Reset voting',
    );
    expect(db.round()!.status).toBe('proposed');
  });
  it('charges recovery exactly once and blocks spending during voting', () => {
    const db = make();
    const revision = db.state().revision;
    db.recover(revision, 'potion', 'host');
    expect(db.state().partyHealth).toBe(95);
    expect(() => db.recover(revision, 'potion', 'host')).toThrow('Stale');
    expect(() => db.recover(db.state().revision, 'rest', 'host')).toThrow('10 gold');
    db.start(3, 70, 60, 'live');
    expect(() => db.recover(db.state().revision, 'potion', 'host')).toThrow('Resolve voting');
  });
  it('preserves remaining vote time and rejects delayed messages from paused windows', () => {
    vi.useFakeTimers();
    const db = make();
    const r = db.start(3, 70, 60, 'live');
    vi.advanceTimersByTime(10000);
    db.controlRound(r.id, db.state().revision, 'pause', 'host');
    const pause = Date.now();
    expect(db.vote('paused', 'u', '!rift a', 'live')).toBe(false);
    expect(() => db.close(r.id)).toThrow('Resume');
    vi.advanceTimersByTime(120000);
    const resumed = db.controlRound(r.id, db.state().revision, 'resume', 'host');
    expect(resumed.deadline - Date.now()).toBe(50000);
    expect(db.vote('delayed', 'u', '!rift a', 'live', 'delivery', pause + 1)).toBe(false);
    expect(db.vote('current', 'u', '!rift c', 'live')).toBe(true);
    const p = db.close(r.id).proposal!;
    db.controlRound(r.id, db.state().revision, 'cancel', 'host');
    expect(() => db.decide(p.id, p.expectedRevision, true, 'host')).toThrow();
    expect(db.state().campaign!.encounters).toBe(0);
  });
});
it('authenticates new host APIs and rejects stale or malformed actions', async () => {
  const { app, repo } = await createApp({ database: ':memory:', origin: 'http://localhost:5173' });
  try {
    const headers: Record<string, string> = { origin: 'http://localhost:5173' };
    const request = (url: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url, headers, payload });
    expect(
      (await request('/api/party/recover', { expectedRevision: 0, action: 'potion' })).statusCode,
    ).toBe(401);
    const login = await request('/api/auth/rehearsal', {});
    headers.cookie = login.headers['set-cookie']!.toString().split(';')[0];
    expect(
      (
        await request('/api/party/recover', {
          expectedRevision: repo.state().revision,
          action: 'invalid',
        })
      ).statusCode,
    ).toBe(400);
    const r = repo.start(3, 70, 60, 'rehearsal');
    const revision = repo.state().revision;
    expect(
      (await request(`/api/rounds/${r.id}/pause`, { expectedRevision: revision })).statusCode,
    ).toBe(200);
    expect(
      (await request(`/api/rounds/${r.id}/resume`, { expectedRevision: revision })).statusCode,
    ).toBe(409);
    expect(
      (await request(`/api/rounds/${r.id}/cancel`, { expectedRevision: repo.state().revision }))
        .statusCode,
    ).toBe(200);
  } finally {
    await app.close();
  }
});
