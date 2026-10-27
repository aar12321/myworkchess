import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { trackPieces } from './tracker'

const play = (moves: string[], start?: string) => {
  const c = new Chess(start)
  for (const m of moves) c.move(m)
  return c.history({ verbose: true })
}
const at = (pieces: ReturnType<typeof trackPieces>, sq: string) => pieces.find(p => p.square === sq && !p.captured)

describe('trackPieces', () => {
  it('keeps piece identity across normal moves', () => {
    const pcs = trackPieces(play(['e4', 'e5', 'Nf3']))
    expect(at(pcs, 'e4')!.id).toBe('wpe2')
    expect(at(pcs, 'f3')!.id).toBe('wng1')
    expect(pcs.length).toBe(32)
  })
  it('marks the captured piece and moves the capturer', () => {
    const pcs = trackPieces(play(['e4', 'd5', 'exd5']))
    expect(pcs.filter(p => p.captured).map(p => p.id)).toEqual(['bpd7'])
    expect(at(pcs, 'd5')!.id).toBe('wpe2')
  })
  it('handles en passant (victim is behind the target square)', () => {
    const pcs = trackPieces(play(['e4', 'a6', 'e5', 'd5', 'exd6']))
    expect(pcs.find(p => p.id === 'bpd7')!.captured).toBe(true)
    expect(at(pcs, 'd6')!.id).toBe('wpe2')
    expect(at(pcs, 'd5')).toBeUndefined()
  })
  it('moves the rook when castling, both sides', () => {
    const k = trackPieces(play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']))
    expect(at(k, 'g1')!.id).toBe('wke1'); expect(at(k, 'f1')!.id).toBe('wrh1')
    const q = trackPieces(play(['d4', 'd5', 'Nc3', 'Nc6', 'Bf4', 'Bf5', 'Qd2', 'Qd7', 'O-O-O']))
    expect(at(q, 'c1')!.id).toBe('wke1'); expect(at(q, 'd1')!.id).toBe('wra1')
  })
  it('turns a promoted pawn into the new piece (here with a capture), keeping its id', () => {
    const pcs = trackPieces(play(['a4', 'b5', 'axb5', 'a6', 'bxa6', 'Nf6', 'a7', 'e6', 'axb8=Q']))
    const q = at(pcs, 'b8')!
    expect(q.type).toBe('q'); expect(q.color).toBe('w'); expect(q.id).toBe('wpa2')
    expect(pcs.find(p => p.id === 'bnb8')!.captured).toBe(true)
  })
  it('replays only the requested number of moves', () => {
    const moves = play(['e4', 'e5', 'Nf3'])
    expect(at(trackPieces(moves, 1), 'e4')).toBeTruthy()
    expect(at(trackPieces(moves, 0), 'e2')).toBeTruthy()
  })
})
