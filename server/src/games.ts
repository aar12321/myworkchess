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

type AiGame = z.infer<typeof aiGame>

/**
 * AI games are played in the browser, so the server checks that the claimed ending is actually true for the submitted moves.
 * This stops impossible results (a "checkmate" that isn't one, a win on time against the computer). It cannot prove the moves
 * really came from the computer, so a deliberately constructed game can still get through.
 */
export function verifyAiResult(g: AiGame, c: Chess): string | null {
  const loserIsTurn = c.turn() === 'w' ? '0-1' : '1-0' // result if the side to move lost
  const humanWins = g.result === (g.playerColor === 'w' ? '1-0' : '0-1')
  const draw = g.result === '1/2-1/2'
  switch (g.termination) {
    case 'checkmate': return c.isCheckmate() && g.result === loserIsTurn ? null : 'That is not a checkmate for that side.'
    case 'stalemate': return c.isStalemate() && draw ? null : 'That is not a stalemate.'
    case 'insufficient material': return c.isInsufficientMaterial() && draw ? null : 'There is still enough material to play on.'
    case 'repetition': return c.isThreefoldRepetition() && draw ? null : 'That position was not repeated three times.'
    case 'fifty-move rule': return c.isDraw() && draw ? null : 'The fifty-move rule did not apply.'
    case 'resignation': return !c.isGameOver() && !humanWins && !draw ? null : 'You can only resign a game you are playing, and resigning loses it.'
    case 'timeout':
      // The clock starts after both sides have moved and the side to move is the one charged. The computer never runs out of time.
      return !c.isGameOver() && c.history().length >= 2 && g.result === loserIsTurn && !humanWins ? null : 'That timeout is not possible.'
    default: return 'Unknown way for the game to end.'
  }
}

export function gamesRouter(db: Db) {
  const r = Router()

  // A shared replay link: readable without an account, by its unguessable id only. Reveals no user ids.
  r.get('/shared/:shareId', (req, res) => {
    const row = db.prepare(`SELECT white_label AS whiteLabel, black_label AS blackLabel, mode, result, termination, pgn, ended_at AS endedAt, share_id AS shareId
      FROM games WHERE share_id = ?`).get(req.params.shareId)
    if (!row) return res.status(404).json({ error: 'Game not found' })
    res.json({ game: row })
  })

  r.use(requireAuth)

  // Record a finished game against the AI (played in the browser).
  r.post('/', (req, res) => {
    const p = aiGame.safeParse(req.body)
    if (!p.success) return res.status(400).json({ error: 'Invalid game' })
    const g = p.data
    const replay = new Chess()
    try { replay.loadPgn(g.pgn) } catch { return res.status(400).json({ error: 'Invalid PGN' }) }
    const wrong = verifyAiResult(g, replay)
    if (wrong) return res.status(422).json({ error: wrong })
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
      mode, result, termination, ended_at AS endedAt, share_id AS shareId FROM games WHERE white_id = ? OR black_id = ? ORDER BY id DESC LIMIT 100`).all(me.id, me.id)
    res.json({ games: rows })
  })

  r.get('/:id', (req, res) => {
    const me = req.user!
    const row = db.prepare(`SELECT id, white_id AS whiteId, black_id AS blackId, white_label AS whiteLabel, black_label AS blackLabel,
      mode, result, termination, pgn, started_at AS startedAt, ended_at AS endedAt, share_id AS shareId FROM games WHERE id = ? AND (white_id = ? OR black_id = ?)`)
      .get(Number(req.params.id), me.id, me.id)
    if (!row) return res.status(404).json({ error: 'Game not found' })
    res.json({ game: row })
  })
  return r
}
