import type { DatabaseSync } from 'node:sqlite';
const migrations = [
  `
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,type TEXT NOT NULL,detail TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS deliveries(id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS votes(round TEXT,user TEXT,choice TEXT,source TEXT,PRIMARY KEY(round,user));
`,
  `ALTER TABLE votes ADD COLUMN source_timestamp INTEGER NOT NULL DEFAULT 0;`,
];
export function migrate(db: DatabaseSync) {
  db.exec(
    'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);',
  );
  for (const [index, sql] of migrations.entries()) {
    const version = index + 1;
    if (db.prepare('SELECT version FROM schema_migrations WHERE version=?').get(version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations VALUES(?)').run(version);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
