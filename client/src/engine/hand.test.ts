import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { buildHandFromLines } from './hand'

const line = (uci: string, i: number) => ({ uci, multipv: i + 1, cp: 30 - i * 5, mate: null, depth: 10 })

describe('buildHandFromLines', () => {
  it('deals 5 unique legal cards from the engine lines', () => {
    const fen = new Chess().fen()
    const lines = ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'b1c3'].map(line)
    const hand = buildHandFromLines(fen, lines, 5, false)
    expect(hand.map(c => c.san)).toEqual(['e4', 'd4', 'Nf3', 'c4', 'Nc3'])
    expect(hand[0].best).toBe(true)
    expect(hand[2].title).toBe('Knight')
    expect(new Set(hand.map(c => c.id)).size).toBe(5)
  })
  it('tops up from legal moves when the engine returns fewer lines, ignoring illegal ones', () => {
    const hand = buildHandFromLines(new Chess().fen(), [line('e2e4', 0), line('e2e5', 1)], 5, false)
    expect(hand.length).toBe(5)
    expect(hand.every(c => c.uci !== 'e2e5')).toBe(true)
  })
  it('returns only as many cards as legal moves exist (2 here)', () => {
    // Black king in the corner with exactly two legal moves.
    const fen = '7k/8/5Q2/8/8/8/8/K7 b - - 0 1'
    const chess = new Chess(fen)
    expect(chess.moves().length).toBe(2)
    expect(buildHandFromLines(fen, [], 5).length).toBe(2)
  })
  it('names castling cards "Castle"', () => {
    const fen = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1'
    const hand = buildHandFromLines(fen, [line('e1g1', 0)], 5, false)
    expect(hand[0].title).toBe('Castle')
    expect(hand[0].san).toBe('O-O')
  })
})
