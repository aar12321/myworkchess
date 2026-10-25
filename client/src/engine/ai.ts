import { Chess } from 'chess.js'
import { engine } from './stockfish'

export type Level = 'easy' | 'medium' | 'hard'
export const LEVELS: Record<Level, { label: string; blurb: string; skill: number; depth: number; pick: number; elo: string }> = {
  easy:   { label: 'Easy',   blurb: 'Makes friendly mistakes. Great for learning the cards.', skill: 1,  depth: 3,  pick: 3, elo: '~800' },
  medium: { label: 'Medium', blurb: 'Solid tactics with the occasional slip.',               skill: 9,  depth: 8,  pick: 2, elo: '~1500' },
  hard:   { label: 'Hard',   blurb: 'Full-strength Stockfish. No mercy.',                    skill: 20, depth: 14, pick: 1, elo: '2500+' },
}

/** Returns a UCI move for the side to move at `fen`, weakened according to the level. */
export async function aiMove(fen: string, level: Level): Promise<string> {
  const cfg = LEVELS[level]
  const legal = new Chess(fen).moves({ verbose: true })
  if (legal.length === 0) throw new Error('no legal moves')
  const lines = await engine.search(fen, { multiPv: Math.min(cfg.pick, legal.length), depth: cfg.depth, skill: cfg.skill })
  const pool = lines.filter(l => l.uci).slice(0, cfg.pick)
  if (pool.length === 0) { const m = legal[0]; return `${m.from}${m.to}${m.promotion ?? ''}` }
  // Weighted toward the engine's top choice, but lower levels may play the 2nd/3rd best.
  const weights = pool.map((_, i) => 1 / (i + 1) ** 1.2)
  let r = Math.random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i].uci }
  return pool[0].uci
}
