import { it, expect } from 'vitest';
import { Repository } from '../../apps/server/src/storage/repository';
it('resets votes and pending proposal without losing audit history or replay protection', () => {
  const repo = new Repository(':memory:');
  try {
    const original = repo.start(3, 70, 120, 'live');
    repo.vote('old-message', 'viewer', '!rift a', 'live');
    const proposal = repo.close(original.id).proposal!;
    const before = repo.state();
    const next = repo.reset(original.id, before.revision, 'host');
    expect(next.id).not.toBe(original.id);
    expect(next.tally).toEqual({ a: 0, b: 0, c: 0 });
    expect(next.proposal).toBeNull();
    expect(next.status).toBe('voting');
    expect(next.deadline - next.openedAt).toBe(120000);
    expect(repo.state()).toEqual({ ...before, revision: before.revision + 1 });
    expect(repo.vote('old-message', 'viewer', '!rift a', 'live')).toBe(false);
    expect(repo.vote('delayed', 'viewer', '!rift c', 'live', 'delivery', next.openedAt - 1)).toBe(
      false,
    );
    expect(repo.vote('fresh', 'viewer', '!rift b', 'live')).toBe(true);
    expect(repo.round()!.tally).toEqual({ a: 0, b: 1, c: 0 });
    expect(() => repo.decide(proposal.id, proposal.expectedRevision, true, 'host')).toThrow();
    expect(() => repo.reset(original.id, before.revision, 'host')).toThrow();
    expect(repo.snapshot().events.some((e) => e.type === 'round.reset')).toBe(true);
    expect(
      repo.db.prepare('SELECT count(*) AS n FROM votes WHERE round=?').get(original.id)!.n,
    ).toBe(1);
  } finally {
    repo.db.close();
  }
});
it('does not undo an approved encounter and rejects a reset racing an approval', () => {
  const repo = new Repository(':memory:');
  try {
    const r = repo.start(3, 70, 60, 'live');
    repo.vote('m', 'u', '!rift a', 'live');
    const p = repo.close(r.id).proposal!;
    repo.decide(p.id, p.expectedRevision, true, 'host');
    expect(() => repo.reset(r.id, p.expectedRevision, 'host')).toThrow('Stale');
    const before = repo.state();
    repo.reset(r.id, before.revision, 'host');
    expect(repo.state()).toEqual({ ...before, revision: before.revision + 1 });
    expect(repo.snapshot().canRollback).toBe(false);
  } finally {
    repo.db.close();
  }
});
