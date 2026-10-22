import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const dataDir = process.env.SAKHI_DATA_DIR || (process.env.VERCEL ? '/tmp/sakhi' : null) || path.resolve(import.meta.dirname, '../data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'sakhi.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY,
    author      TEXT    NOT NULL,
    lat         REAL    NOT NULL,
    lng         REAL    NOT NULL,
    place       TEXT    NOT NULL COLLATE NOCASE,
    flair       TEXT    NOT NULL CHECK (flair IN ('Review', 'Alert', 'Tip')),
    rating      INTEGER NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
    title       TEXT    NOT NULL,
    body        TEXT    NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS posts_geo ON posts (lat, lng);

  CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    tag     TEXT    NOT NULL COLLATE NOCASE,
    PRIMARY KEY (post_id, tag)
  );
  CREATE INDEX IF NOT EXISTS post_tags_tag ON post_tags (tag);

  CREATE TABLE IF NOT EXISTS votes (
    post_id INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    voter   TEXT    NOT NULL,
    value   INTEGER NOT NULL CHECK (value IN (-1, 1)),
    PRIMARY KEY (post_id, voter)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY,
    post_id    INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    author     TEXT    NOT NULL,
    body       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS comments_post ON comments (post_id);

  CREATE TABLE IF NOT EXISTS sos (
    id          TEXT    PRIMARY KEY,
    owner       TEXT    NOT NULL,
    lat         REAL    NOT NULL,
    lng         REAL    NOT NULL,
    accuracy    REAL,
    started_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    resolved_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS journeys (
    id          TEXT    PRIMARY KEY,
    owner       TEXT    NOT NULL,
    dest        TEXT    NOT NULL,
    contacts    TEXT    NOT NULL DEFAULT '[]',
    lat         REAL    NOT NULL,
    lng         REAL    NOT NULL,
    accuracy    REAL,
    timeout_ms  INTEGER NOT NULL,
    started_at  INTEGER NOT NULL,
    last_beat   INTEGER NOT NULL,
    checkin_at  INTEGER NOT NULL,
    sos_id      TEXT,
    ended_at    INTEGER
  );
  CREATE INDEX IF NOT EXISTS journeys_live ON journeys (ended_at, sos_id);

  CREATE TABLE IF NOT EXISTS flags (
    post_id    INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    flagger    TEXT    NOT NULL,
    reason     TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (post_id, flagger)
  );

  CREATE TABLE IF NOT EXISTS push_subs (
    endpoint   TEXT    PRIMARY KEY,
    author     TEXT    NOT NULL,
    sub        TEXT    NOT NULL,
    lat        REAL,
    lng        REAL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS push_subs_author ON push_subs (author);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

for (const sql of [
  'ALTER TABLE sos ADD COLUMN auto INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE sos ADD COLUMN journey_id TEXT',
  "ALTER TABLE journeys ADD COLUMN ride TEXT NOT NULL DEFAULT '{}'",
]) {
  try {
    db.exec(sql);
  } catch {
  }
}

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
