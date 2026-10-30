import type { Color, Move, PieceSymbol } from 'chess.js'
import type { Card } from './engine/hand'

const NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const side = (c: Color) => (c === 'w' ? 'white' : 'black')
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** "e4, white pawn" / "e5, empty": the accessible name of a board square. */
export function squareLabel(square: string, piece?: { type: PieceSymbol; color: Color } | null): string {
  return piece ? `${square}, ${side(piece.color)} ${NAME[piece.type]}` : `${square}, empty`
}

/** A played move in words, for the live announcement. */
export function describeMove(m: Move): string {
  const who = cap(side(m.color))
  let s = m.isKingsideCastle() ? `${who} castles kingside` : m.isQueensideCastle() ? `${who} castles queenside` : `${who} ${NAME[m.piece]} from ${m.from} to ${m.to}`
  if (m.captured) s += `, captures ${side(m.color === 'w' ? 'b' : 'w')} ${NAME[m.captured]}${m.flags.includes('e') ? ' en passant' : ''}`
  if (m.promotion) s += `, promotes to ${NAME[m.promotion]}`
  if (m.san.endsWith('#')) s += ', checkmate'
  else if (m.san.endsWith('+')) s += ', check'
  return s
}

/** A move card in words: "Knight, Nf3: knight from g1 to f3". */
export function describeCard(c: Card): string {
  let s = `${c.title}, ${c.san}: ${NAME[c.piece]} from ${c.from} to ${c.to}`
  if (c.captured) s += `, captures ${NAME[c.captured]}`
  if (c.promotion) s += `, promotes to ${NAME[c.promotion as PieceSymbol]}`
  return s
}
