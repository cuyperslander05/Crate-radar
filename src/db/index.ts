import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrateEmbedded } from './migrateEmbedded.ts';
import * as schema from './schema.ts';
import { dbFile, dataDir } from '../lib/env.ts';

/**
 * The embedded (SQLite) database for the Crate Desktop app.
 *
 * The file lives in CRATE_DATA_DIR (the user data directory in the packaged
 * app). Foreign keys are enforced and the schema is created on first boot, so
 * the app needs no separate install or migration step.
 */
let sqlite: Database.Database | null = null;
let _db: ReturnType<typeof createDrizzle> | null = null;

function ensureFile() {
  const dir = dataDir();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  fs.mkdirSync(dir, { recursive: true });
  return dbFile();
}

function createSqlite() {
  if (!sqlite) {
    const file = ensureFile();
    sqlite = new Database(file);
    sqlite.pragma('foreign_keys = ON');
    // WAL is far more pleasant for an embedded DB used by one process.
    sqlite.pragma('journal_mode = WAL');
  }
  return sqlite;
}

function createDrizzle() {
  const client = createSqlite();
  return drizzle(client, { schema });
}

/** Creates tables on first boot; safe to call every start. */
export function ensureSchema() {
  const client = createSqlite();
  migrateEmbedded(client);
}

export function getDb() {
  if (!_db) {
    ensureSchema();
    _db = createDrizzle();
  }
  return _db;
}

export const db = getDb();

/** Closes the underlying file (used by the Electron app on quit). */
export function closeDb() {
  if (sqlite) {
    try { sqlite.close(); } catch { /* already closed */ }
    sqlite = null;
    _db = null;
  }
}
