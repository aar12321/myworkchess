import { Router } from 'express'
import { Chess } from 'chess.js'
import { z } from 'zod'
import { requireAuth } from './auth.js'
import { saveGame, type Db } from './db.js'

const aiGame = z.object({
  mode: z.enum(['ai-easy', 'ai-medium', 'ai-hard']),
  playerColor: z.enum(['w', 'b']),
  result: z.enum(['1-0', '0-1', '1/2-1/2']),
  termination: z.string().max(40),
  pgn: z.string().max(20000),
  startedAt: z.number(),
})

export function gamesRouter(db: Db) {
  const r = Router()
  r.use(requireAuth)

  // Record a finished game against the AI (played in the browser).
  r.post('/', (req, res) => {
    const p = aiGame.safeParse(req.body)
    if (!p.success) return res.status(400).json({ error: 'Invalid game' })
    const g = p.data
    try { new Chess().loadPgn(g.pgn) } catch { return res.status(400).json({ error: 'Invalid PGN' }) }
    const me = req.user!
    const level = g.mode.replace('ai-', '')
    const ai = `Stockfish (${level[0].toUpperCase()}${level.slice(1)})`
    const id = saveGame(db, {
      whiteId: g.playerColor === 'w' ? me.id : null, blackId: g.playerColor === 'b' ? me.id : null,
      whiteLabel: g.playerColor === 'w' ? me.username : ai, blackLabel: g.playerColor === 'b' ? me.username : ai,
      mode: g.mode, result: g.result, termination: g.termination, pgn: g.pgn,
      startedAt: g.startedAt, endedAt: Date.now(),
    })
    res.status(201).json({ id })
  })

  r.get('/', (req, res) => {
    const me = req.user!
    const rows = db.prepare(`SELECT id, white_id AS whiteId, black_id AS blackId, white_label AS whiteLabel, black_label AS blackLabel,
      mode, result, termination, ended_at AS endedAt FROM games WHERE white_id = ? OR black_id = ? ORDER BY id DESC LIMIT 100`).all(me.id, me.id)
    res.json({ games: rows })
  })

  r.get('/:id', (req, res) => {
    const me = req.user!
    const row = db.prepare(`SELECT id, white_id AS whiteId, black_id AS blackId, white_label AS whiteLabel, black_label AS blackLabel,
      mode, result, termination, pgn, started_at AS startedAt, ended_at AS endedAt FROM games WHERE id = ? AND (white_id = ? OR black_id = ?)`)
      .get(Number(req.params.id), me.id, me.id)
    if (!row) return res.status(404).json({ error: 'Game not found' })
    res.json({ game: row })
  })
  return r
}
