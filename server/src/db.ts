import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { Chess } from 'chess.js'

export const newShareId = () => randomBytes(8).toString('base64url').slice(0, 10)

export function openDb(file = process.env.DB_FILE || 'data/chess.db') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      white_id INTEGER, black_id INTEGER,
      white_label TEXT NOT NULL, black_label TEXT NOT NULL,
      mode TEXT NOT NULL,
      result TEXT NOT NULL,
      termination TEXT NOT NULL,
      pgn TEXT NOT NULL,
      started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS games_white ON games(white_id);
    CREATE INDEX IF NOT EXISTS games_black ON games(black_id);
    -- Unfinished friend games, so a restart doesn't end them.
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      snapshot TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
  // Shareable replay links: an unguessable id per game (added to databases created before this existed).
  const cols = db.prepare('PRAGMA table_info(games)').all() as { name: string }[]
  if (!cols.some(c => c.name === 'share_id')) db.exec('ALTER TABLE games ADD COLUMN share_id TEXT')
  for (const row of db.prepare('SELECT id FROM games WHERE share_id IS NULL').all() as { id: number }[])
    db.prepare('UPDATE games SET share_id = ? WHERE id = ?').run(newShareId(), row.id)
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS games_share ON games(share_id)')
  // Seed the demo account (username "demo", password "1234").
  if (process.env.SEED_DEMO !== '0' && !db.prepare('SELECT 1 FROM users WHERE username = ?').get('demo')) {
    db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
      .run('demo', bcrypt.hashSync('1234', 10), Date.now())
  }
  return db
}
export type Db = ReturnType<typeof openDb>

export interface GameRecord {
  whiteId: number | null; blackId: number | null
  whiteLabel: string; blackLabel: string
  mode: string; result: string; termination: string; pgn: string
  startedAt: number; endedAt: number
}

/** Adds the standard PGN tag pairs so a saved game opens cleanly in Lichess/other tools. */
export function withHeaders(pgn: string, g: Pick<GameRecord, 'whiteLabel' | 'blackLabel' | 'result' | 'termination' | 'endedAt'>): string {
  try {
    const c = new Chess()
    c.loadPgn(pgn)
    const d = new Date(g.endedAt)
    c.setHeader('Event', "Knight's Hand")
    c.setHeader('Site', 'Knight\'s Hand')
    c.setHeader('Date', `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`)
    c.setHeader('White', g.whiteLabel)
    c.setHeader('Black', g.blackLabel)
    c.setHeader('Result', g.result)
    c.setHeader('Termination', g.termination)
    return c.pgn()
  } catch { return pgn }
}

export function saveGame(db: Db, g: GameRecord): number {
  const r = db.prepare(`INSERT INTO games (white_id, black_id, white_label, black_label, mode, result, termination, pgn, started_at, ended_at, share_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(g.whiteId, g.blackId, g.whiteLabel, g.blackLabel, g.mode, g.result, g.termination, withHeaders(g.pgn, g), g.startedAt, g.endedAt, newShareId())
  return Number(r.lastInsertRowid)
}

export function saveRoomRow(db: Db, code: string, snapshot: string) {
  db.prepare('INSERT INTO rooms (code, snapshot, updated_at) VALUES (?,?,?) ON CONFLICT(code) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at')
    .run(code, snapshot, Date.now())
}
export function deleteRoomRow(db: Db, code: string) { db.prepare('DELETE FROM rooms WHERE code = ?').run(code) }
export function loadRoomRows(db: Db) { return db.prepare('SELECT code, snapshot FROM rooms').all() as { code: string; snapshot: string }[] }
