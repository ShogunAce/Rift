import { it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { Repository } from '../../apps/server/src/storage/repository';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../../apps/server/src/storage/migrations';
it('upgrades existing vote records without losing their choices or replay protection', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY); INSERT INTO schema_migrations VALUES(1); CREATE TABLE votes(round TEXT,user TEXT,choice TEXT,source TEXT,PRIMARY KEY(round,user)); INSERT INTO votes VALUES('round','viewer','b','chat');",
    );
    migrate(db);
    expect(db.prepare('SELECT * FROM votes').get()).toMatchObject({
      round: 'round',
      user: 'viewer',
      choice: 'b',
      source: 'chat',
      source_timestamp: 0,
    });
    migrate(db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()!.n).toBe(2);
  } finally {
    db.close();
  }
});
it('restores state, round, deduplication keys and rollback after database reopen', () => {
  const file = join(tmpdir(), `rift-test-${randomUUID()}.sqlite`);
  let db = new Repository(file);
  try {
    const r = db.start(3, 70, 60, 'live');
    db.vote('message', 'viewer', '!rift a', 'live');
    const p = db.close(r.id).proposal!;
    db.decide(p.id, p.expectedRevision, true, 'host');
    const approved = db.state();
    db.db.close();
    db = new Repository(file);
    expect(db.state()).toEqual(approved);
    expect(db.snapshot().canRollback).toBe(true);
    expect(db.db.prepare('SELECT id FROM deliveries WHERE id=?').get('message')).toBeDefined();
    db.rollback(approved.revision, 'host');
    expect(db.state().threat).toBe(0);
    expect(db.snapshot().events[0].type).toBe('encounter.rolled_back');
  } finally {
    db.db.close();
    for (const suffix of ['', '-wal', '-shm'])
      if (existsSync(file + suffix)) unlinkSync(file + suffix);
  }
});

it('restores paused voting and campaign inventory after reopening the database', () => {
  const file = join(tmpdir(), `rift-campaign-${randomUUID()}.sqlite`);
  let db = new Repository(file);
  try {
    const state = db.state();
    state.campaign!.gold = 45;
    state.campaign!.armor = 4;
    db.put('state', state);
    const round = db.start(4, 55, 60, 'live');
    db.controlRound(round.id, db.state().revision, 'pause', 'host');
    const paused = db.round();
    const saved = db.state();
    db.db.close();
    db = new Repository(file);
    expect(db.round()).toEqual(paused);
    expect(db.state()).toEqual(saved);
    expect(db.vote('while-paused', 'viewer', '!rift a', 'live')).toBe(false);
    db.controlRound(round.id, db.state().revision, 'resume', 'host');
    expect(db.vote('resumed', 'viewer', '!rift a', 'live')).toBe(true);
  } finally {
    db.db.close();
    for (const suffix of ['', '-wal', '-shm'])
      if (existsSync(file + suffix)) unlinkSync(file + suffix);
  }
});
