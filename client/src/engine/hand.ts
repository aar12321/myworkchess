import { Chess, type Move, type PieceSymbol } from 'chess.js'
import { engine, type EngineLine } from './stockfish'

export interface Card {
  id: string
  title: string          // "Knight", "Castle", ...
  san: string            // "Nf3"
  uci: string
  from: string
  to: string
  promotion?: string
  piece: PieceSymbol
  color: 'w' | 'b'
  captured?: PieceSymbol
  flags: string
  rank: number           // 1 = engine's favourite
  evalLabel: string      // "+0.4", "M3"
  best: boolean
}

export const PIECE_TITLE: Record<PieceSymbol, string> = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' }

const evalText = (l: EngineLine | undefined, turn: 'w' | 'b') => {
  if (!l) return ''
  if (l.mate !== null) return `M${Math.abs(l.mate)}`
  const cp = (l.cp ?? 0) * (turn === 'w' ? 1 : -1) / 100
  return `${cp >= 0 ? '+' : ''}${cp.toFixed(1)}`
}

export function cardFromMove(m: Move, rank: number, line?: EngineLine): Card {
  const isCastle = m.isKingsideCastle() || m.isQueensideCastle()
  return {
    id: `${m.from}${m.to}${m.promotion ?? ''}`,
    title: isCastle ? 'Castle' : PIECE_TITLE[m.piece],
    san: m.san, uci: `${m.from}${m.to}${m.promotion ?? ''}`, from: m.from, to: m.to, promotion: m.promotion,
    piece: m.piece, color: m.color, captured: m.captured, flags: m.flags, rank,
    evalLabel: evalText(line, m.color), best: rank === 1,
  }
}

/** Deal up to 5 cards: the engine's five best moves (distinct from/to), shuffled so the best isn't always first. */
export function buildHandFromLines(fen: string, lines: EngineLine[], n = 5, shuffle = true): Card[] {
  const chess = new Chess(fen)
  const legal = chess.moves({ verbose: true })
  const byUci = new Map(legal.map(m => [`${m.from}${m.to}${m.promotion ?? ''}`, m]))
  const cards: Card[] = []
  const seen = new Set<string>()
  for (const l of lines) {
    // Under-promotions are dropped unless the engine itself chose one.
    const m = byUci.get(l.uci)
    if (!m || seen.has(l.uci)) continue
    seen.add(l.uci)
    cards.push(cardFromMove(m, cards.length + 1, l))
    if (cards.length === n) break
  }
  // Fewer than n engine lines (rare): top up with remaining legal moves, queens before under-promotions.
  for (const m of legal) {
    if (cards.length >= n) break
    const id = `${m.from}${m.to}${m.promotion ?? ''}`
    if (seen.has(id) || (m.promotion && m.promotion !== 'q')) continue
    seen.add(id)
    cards.push(cardFromMove(m, cards.length + 1))
  }
  if (shuffle) for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]] }
  return cards
}

export async function dealHand(fen: string, depth = 10): Promise<Card[]> {
  const legalCount = new Chess(fen).moves().length
  if (legalCount === 0) return []
  const lines = await engine.search(fen, { multiPv: Math.min(5, legalCount), depth, skill: 20, movetime: 1500 })
  return buildHandFromLines(fen, lines)
}
