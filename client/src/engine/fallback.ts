import { Chess, type Move, type PieceSymbol } from 'chess.js'

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** Rough move quality used only when the engine is unavailable: captures, checks, promotions, development, centre. */
export function scoreMove(chess: Chess, m: Move): number {
  let s = 0
  if (m.captured) s += 10 * VALUE[m.captured] - VALUE[m.piece]
  if (m.promotion) s += 8 * (VALUE[m.promotion] / 9 + 1)
  if (m.san.includes('#')) s += 1000
  else if (m.san.includes('+')) s += 4
  if (m.isKingsideCastle() || m.isQueensideCastle()) s += 5
  const file = 'abcdefgh'.indexOf(m.to[0]), rank = Number(m.to[1])
  const centre = 3.5 - Math.abs(file - 3.5) + 3.5 - Math.abs(rank - 4.5)
  s += centre * 0.4
  if ((m.piece === 'n' || m.piece === 'b') && (m.from[1] === '1' || m.from[1] === '8')) s += 2 // develop minor pieces
  // Don't hang the piece: penalise moving a valuable piece onto a square the opponent attacks and we don't protect.
  chess.move(m)
  const recaptured = chess.moves({ verbose: true }).some(r => r.to === m.to && r.captured)
  chess.undo()
  if (recaptured) s -= VALUE[m.piece] * 3
  return s + Math.random() * 1.5
}

/** Legal moves, best-looking first, by the rough heuristic above. */
export function rankMoves(fen: string): Move[] {
  const chess = new Chess(fen)
  return chess.moves({ verbose: true }).map(m => ({ m, s: scoreMove(chess, m) })).sort((a, b) => b.s - a.s).map(x => x.m)
}
