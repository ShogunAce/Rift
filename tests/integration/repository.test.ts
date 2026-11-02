import { describe, it, expect, afterEach, vi } from 'vitest';
import { Repository } from '../../apps/server/src/storage/repository';
const stores: Repository[] = [];
const make = () => {
  const r = new Repository(':memory:');
  stores.push(r);
  return r;
};
afterEach(() => {
  stores.forEach((r) => r.db.close());
  stores.length = 0;
  vi.useRealTimers();
});
describe('persistent encounter transactions', () => {
  it('rejects cross-round delayed events and separately deduplicates source and delivery IDs', () => {
    const db = make();
    const r = db.start(3, 70, 60, 'live');
    expect(db.vote('old-chat', 'u', '!rift a', 'live', 'old-delivery', r.openedAt - 1)).toBe(false);
    expect(db.vote('chat1', 'u', '!rift a', 'live', 'delivery1', r.openedAt)).toBe(true);
    expect(db.vote('chat1', 'u', '!rift b', 'live', 'delivery2', r.openedAt)).toBe(false);
    expect(db.vote('chat2', 'u', '!rift b', 'live', 'delivery1', r.openedAt)).toBe(false);
    expect(db.round()?.tally).toEqual({ a: 1, b: 0, c: 0 });
  });
  it('deduplicates delivery and replaces one user vote', () => {
    const db = make();
    db.start(3, 70, 60, 'live');
    expect(db.vote('m1', 'u1', '!rift a', 'live')).toBe(true);
    db.vote('m2', 'u2', '!rift a', 'live');
    db.vote('m3', 'u3', '!rift b', 'live');
    expect(db.round()?.tally).toEqual({ a: 2, b: 1, c: 0 });
    expect(db.vote('m1', 'u1', '!rift c', 'live')).toBe(false);
    db.vote('m4', 'u1', '!rift c', 'live');
    expect(db.round()?.tally).toEqual({ a: 1, b: 1, c: 1 });
  });
  it('enforces deadline and input provenance', () => {
    vi.useFakeTimers();
    const db = make();
    db.start(3, 70, 10, 'live');
    expect(db.vote('fake', 'u1', '!rift a', 'rehearsal')).toBe(false);
    vi.advanceTimersByTime(10000);
    expect(db.vote('late', 'u1', '!rift a', 'live')).toBe(false);
  });
  it('requires approval, commits once, and records compensating rollback', () => {
    const db = make();
    const r = db.start(3, 70, 60, 'live');
    db.vote('m', 'u', '!rift a', 'live');
    const before = db.state();
    const p = db.close(r.id).proposal!;
    expect(db.state()).toEqual(before);
    db.decide(p.id, before.revision, true, 'broadcaster');
    const committed = db.state();
    expect(committed.threat).toBe(35);
    db.decide(p.id, before.revision, true, 'broadcaster');
    expect(db.state()).toEqual(committed);
    db.rollback(committed.revision, 'broadcaster');
    expect(db.state().threat).toBe(before.threat);
    expect(db.state().revision).toBe(committed.revision + 1);
    expect(db.snapshot().events[0].type).toBe('encounter.rolled_back');
    expect(() => db.rollback(db.state().revision, 'broadcaster')).toThrow();
  });
  it('stale approval fails atomically and rejection preserves state', () => {
    const db = make();
    const r = db.start(3, 70, 60, 'live');
    db.vote('m', 'u', '!rift a', 'live');
    const p = db.close(r.id).proposal!;
    const before = db.state();
    expect(() => db.decide(p.id, 999, true, 'host')).toThrow('Stale');
    expect(db.round()?.proposal?.status).toBe('pending');
    expect(db.state()).toEqual(before);
    db.decide(p.id, before.revision, false, 'host');
    expect(db.state()).toEqual(before);
  });
  it('cancels empty rounds and blocks overlapping rounds', () => {
    const db = make();
    const r = db.start(3, 70, 60, 'live');
    expect(() => db.start(3, 70, 60, 'live')).toThrow();
    expect(db.close(r.id).status).toBe('cancelled');
    expect(db.close(r.id).proposal).toBeNull();
  });
  it('expires reservations and retains cooldown restrictions', () => {
    const db = make();
    let r = db.start(3, 70, 60, 'live');
    db.vote('m', 'u', '!rift a', 'live');
    let p = db.close(r.id).proposal!;
    db.decide(p.id, p.expectedRevision, true, 'host');
    r = db.start(3, 70, 60, 'live');
    db.vote('n', 'u', '!rift a', 'live');
    p = db.close(r.id).proposal!;
    expect(p.cost).toBe(0);
    db.decide(p.id, p.expectedRevision, false, 'host');
    db.start(3, 70, 60, 'live');
    expect(db.state().activeEffects).toEqual([]);
  });
});
