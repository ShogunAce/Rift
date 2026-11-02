import { it, expect } from 'vitest';
import { Repository } from '../../apps/server/src/storage/repository';
import { createApp } from '../../apps/server/src/index';
import type { Choice } from '../../packages/shared/src/contracts';
it('preserves the independent vote oracle over 10,000 changes and duplicate deliveries', () => {
  const db = new Repository(':memory:');
  try {
    db.start(3, 70, 300, 'live');
    const expected = new Map<string, Choice>();
    let seed = 734921;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (let i = 0; i < 10000; i++) {
      const user = 'viewer-' + (random() % 1500);
      const choice = (['a', 'b', 'c'] as Choice[])[random() % 3];
      const id = 'chat-' + i;
      expect(db.vote(id, user, '!rift ' + choice, 'live', 'delivery-' + i)).toBe(true);
      expected.set(user, choice);
      if (i % 3 === 0) expect(db.vote(id, user, '!rift a', 'live', 'redelivery-' + i)).toBe(false);
    }
    const tally = { a: 0, b: 0, c: 0 };
    for (const choice of expected.values()) tally[choice]++;
    expect(db.round()!.tally).toEqual(tally);
    const sql = { a: 0, b: 0, c: 0 };
    for (const row of db.db.prepare('SELECT choice,count(*) as n FROM votes GROUP BY choice').all())
      sql[row.choice as Choice] = Number(row.n);
    expect(sql).toEqual(tally);
  } finally {
    db.db.close();
  }
});
it('does not let a delayed earlier command replace a newer vote', () => {
  const db = new Repository(':memory:');
  try {
    const r = db.start(3, 70, 300, 'live');
    db.vote('new', 'viewer', '!rift b', 'live', 'delivery-new', r.openedAt + 10);
    expect(db.vote('old', 'viewer', '!rift a', 'live', 'delivery-old', r.openedAt + 5)).toBe(false);
    expect(db.round()!.tally).toEqual({ a: 0, b: 1, c: 0 });
  } finally {
    db.db.close();
  }
});
it('returns protocol status codes for oversized and malformed bodies', async () => {
  const { app } = await createApp({ database: ':memory:', origin: 'http://localhost:5173' });
  try {
    const headers = { origin: 'http://localhost:5173', 'content-type': 'application/json' };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/rehearsal',
          headers,
          payload: JSON.stringify({ text: 'x'.repeat(17000) }),
        })
      ).statusCode,
    ).toBe(413);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/rehearsal',
          headers,
          payload: '{broken',
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await app.close();
  }
});
