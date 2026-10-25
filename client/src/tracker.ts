import { Chess, type Color, type Move, type PieceSymbol } from 'chess.js'

export interface TPiece { id: string; type: PieceSymbol; color: Color; square: string; captured: boolean }

/** Replays the first `upto` moves and returns every piece with a stable id, so the board can animate moves and fade captures. */
export function trackPieces(moves: Move[], upto = moves.length): TPiece[] {
  const pieces: TPiece[] = []
  const at = new Map<string, TPiece>()
  for (const row of new Chess().board()) for (const p of row) {
    if (!p) continue
    const t: TPiece = { id: `${p.color}${p.type}${p.square}`, type: p.type, color: p.color, square: p.square, captured: false }
    pieces.push(t); at.set(p.square, t)
  }
  for (let i = 0; i < upto; i++) {
    const m = moves[i]
    const victimSq = m.flags.includes('e') ? m.to[0] + m.from[1] : m.to
    if (m.captured) { const v = at.get(victimSq); if (v) { v.captured = true; at.delete(victimSq) } }
    const p = at.get(m.from)!
    at.delete(m.from); p.square = m.to; at.set(m.to, p)
    if (m.promotion) p.type = m.promotion
    if (m.flags.includes('k') || m.flags.includes('q')) {
      const rank = m.from[1]
      const [rf, rt] = m.flags.includes('k') ? ['h', 'f'] : ['a', 'd']
      const r = at.get(rf + rank)!
      at.delete(rf + rank); r.square = rt + rank; at.set(rt + rank, r)
    }
  }
  return pieces
}

export function movesFromPgn(pgn: string): Move[] {
  const c = new Chess()
  try { if (pgn.trim()) c.loadPgn(pgn) } catch { /* corrupt pgn: show empty */ }
  return c.history({ verbose: true })
}
