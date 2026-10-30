import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { describeCard, describeMove, squareLabel } from './a11y'
import { buildHandFromLines } from './engine/hand'

const last = (moves: string[], start?: string) => { const c = new Chess(start); for (const m of moves) c.move(m); return c.history({ verbose: true }).at(-1)! }

describe('squareLabel', () => {
  it('names pieces and empty squares', () => {
    expect(squareLabel('e4', { type: 'p', color: 'w' })).toBe('e4, white pawn')
    expect(squareLabel('g8', { type: 'n', color: 'b' })).toBe('g8, black knight')
    expect(squareLabel('e5', null)).toBe('e5, empty')
  })
})

describe('describeMove', () => {
  it('describes plain moves, captures and en passant', () => {
    expect(describeMove(last(['Nf3']))).toBe('White knight from g1 to f3')
    expect(describeMove(last(['e4', 'd5', 'exd5']))).toBe('White pawn from e4 to d5, captures black pawn')
    expect(describeMove(last(['e4', 'a6', 'e5', 'd5', 'exd6']))).toBe('White pawn from e5 to d6, captures black pawn en passant')
  })
  it('describes castling, check and checkmate', () => {
    expect(describeMove(last(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']))).toBe('White castles kingside')
    expect(describeMove(last(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']))).toBe('White queen from h5 to f7, captures black pawn, checkmate')
    expect(describeMove(last(['e4', 'e5', 'Qh5', 'Nc6', 'Qxe5+']))).toContain(', check')
  })
  it('describes promotion', () => {
    expect(describeMove(last(['a4', 'b5', 'axb5', 'a6', 'bxa6', 'Nf6', 'a7', 'e6', 'axb8=Q']))).toBe('White pawn from a7 to b8, captures black knight, promotes to queen')
  })
})

describe('describeCard', () => {
  it('reads a card aloud', () => {
    const hand = buildHandFromLines(new Chess().fen(), [{ uci: 'g1f3', multipv: 1, cp: 20, mate: null, depth: 9 }], 1, false)
    expect(describeCard(hand[0])).toBe('Knight, Nf3: knight from g1 to f3')
  })
})
