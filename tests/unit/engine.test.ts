import { describe, it, expect } from 'vitest';
import {
  initialState,
  budget,
  propose,
  applyProposal,
} from '../../apps/server/src/domain/encounter';
import { parseVote, winner } from '../../apps/server/src/domain/voting';
describe('encounter constraints', () => {
  it('uses the specified health/level/reservations formula', () => {
    expect(budget(initialState()).available).toBe(51);
    expect(propose(initialState(), 'a', 'p').cost).toBe(35);
  });
  it('never exceeds the computed budget across supported inputs', () => {
    for (let level = 1; level <= 20; level++)
      for (let health = 0; health <= 100; health += 5)
        for (const choice of ['a', 'b', 'c'] as const) {
          const s = { ...initialState(), partyLevel: level, partyHealth: health };
          const p = propose(s, choice, 'p');
          expect(p.cost).toBeLessThanOrEqual(budget(s).available);
          expect(p.cost).toBeGreaterThanOrEqual(0);
          expect(applyProposal(s, p).partyHealth).toBeGreaterThanOrEqual(0);
        }
  });
  it('proposals do not mutate state and stale commits fail', () => {
    const s = initialState();
    const before = structuredClone(s);
    const p = propose(s, 'a', 'p');
    expect(s).toEqual(before);
    expect(() => applyProposal({ ...s, revision: 2 }, p)).toThrow('Stale');
  });
  it('uses safe alternatives for cooldowns and conflicting effects', () => {
    const s = initialState();
    s.cooldowns.a = 2;
    expect(propose(s, 'a', 'p').cost).toBe(0);
    s.activeEffects = [{ id: 'a', name: 'Stone Golem', reservation: 9, expires: 2 }];
    expect(propose(s, 'b', 'p').effect).toBeNull();
  });
});
describe('vote parsing and ties', () => {
  it('accepts only normalized exact commands', () => {
    expect(parseVote('  !RIFT   A  ')).toBe('a');
    for (const invalid of ['!rift d', 'hello !rift a', '!rift a extra', '<script>', '!rifta'])
      expect(parseVote(invalid)).toBeNull();
  });
  it('reproduces seeded ties and refuses empty rounds', () => {
    expect(winner({ a: 0, b: 0, c: 0 }, 'seed')).toBeNull();
    expect(winner({ a: 2, b: 2, c: 0 }, 'seed')).toBe(winner({ a: 2, b: 2, c: 0 }, 'seed'));
    expect(winner({ a: 1, b: 3, c: 2 }, 'x')).toBe('b');
  });
});
