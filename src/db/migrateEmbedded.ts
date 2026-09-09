import type Database from 'better-sqlite3';

/**
 * Idempotent table bootstrap for the embedded SQLite database. Mirrors
 * schema.ts; kept as a string so tables exist before Drizzle starts, with no
 * external migration step in the packaged app.
 */
const DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  password_hash TEXT,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  sync_rate INTEGER DEFAULT 100,
  spotify_access_token TEXT,
  spotify_refresh_token TEXT,
  spotify_token_expires_at INTEGER,
  has_completed_onboarding INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS jam_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_title TEXT NOT NULL,
  host_uid TEXT NOT NULL REFERENCES users(uid),
  active_listeners_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  current_track_id INTEGER,
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS queue_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES jam_rooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album_art_url TEXT,
  spotify_uri TEXT,
  duration_ms INTEGER,
  added_by_uid TEXT NOT NULL REFERENCES users(uid),
  upvotes_count INTEGER NOT NULL DEFAULT 0,
  played_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS queue_items_room_order_idx ON queue_items(room_id, created_at);

CREATE TABLE IF NOT EXISTS queue_upvotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_item_id INTEGER NOT NULL REFERENCES queue_items(id) ON DELETE CASCADE,
  uid TEXT NOT NULL REFERENCES users(uid),
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS queue_upvotes_item_uid_idx ON queue_upvotes(queue_item_id, uid);

CREATE TABLE IF NOT EXISTS room_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES jam_rooms(id) ON DELETE CASCADE,
  uid TEXT NOT NULL REFERENCES users(uid),
  joined_at INTEGER DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS room_members_room_uid_idx ON room_members(room_id, uid);

CREATE TABLE IF NOT EXISTS listening_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  spotify_uri TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album_art_url TEXT,
  duration_ms INTEGER,
  device_name TEXT,
  played_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS listening_history_uid_played_idx ON listening_history(uid, played_at);
`;

/** Runs the idempotent DDL on startup. */
export function migrateEmbedded(db: Database.Database) {
  db.exec(DDL);
}
