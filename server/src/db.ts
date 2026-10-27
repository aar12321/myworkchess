import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import path from 'node:path'
import { Chess } from 'chess.js'

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
  `)
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
  const r = db.prepare(`INSERT INTO games (white_id, black_id, white_label, black_label, mode, result, termination, pgn, started_at, ended_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(g.whiteId, g.blackId, g.whiteLabel, g.blackLabel, g.mode, g.result, g.termination, withHeaders(g.pgn, g), g.startedAt, g.endedAt)
  return Number(r.lastInsertRowid)
}
