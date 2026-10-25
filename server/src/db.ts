import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import path from 'node:path'

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
  if (!db.prepare('SELECT 1 FROM users WHERE username = ?').get('demo')) {
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

export function saveGame(db: Db, g: GameRecord): number {
  const r = db.prepare(`INSERT INTO games (white_id, black_id, white_label, black_label, mode, result, termination, pgn, started_at, ended_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(g.whiteId, g.blackId, g.whiteLabel, g.blackLabel, g.mode, g.result, g.termination, g.pgn, g.startedAt, g.endedAt)
  return Number(r.lastInsertRowid)
}
