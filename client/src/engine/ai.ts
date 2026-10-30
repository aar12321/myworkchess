import { Chess } from 'chess.js'
import { engine, type EngineLine, type SearchOpts } from './stockfish'
import { rankMoves } from './fallback'

export type Level = 'easy' | 'medium' | 'hard'
export const LEVELS: Record<Level, { label: string; blurb: string; skill: number; depth: number; pick: number; movetime: number; tag: string }> = {
  easy:   { label: 'Easy',   blurb: 'Makes friendly mistakes. Great for learning the cards.', skill: 1,  depth: 3,  pick: 3, movetime: 600,  tag: 'Level 1' },
  medium: { label: 'Medium', blurb: 'Solid tactics with the occasional slip.',               skill: 9,  depth: 8,  pick: 2, movetime: 1200, tag: 'Level 2' },
  hard:   { label: 'Hard',   blurb: 'Full-strength Stockfish. No mercy.',                    skill: 20, depth: 14, pick: 1, movetime: 2500, tag: 'Level 3' },
}

export interface AiChoice { uci: string; degraded: boolean }

/** Returns a UCI move for the side to move at `fen`, weakened according to the level. Falls back to a simple heuristic if the engine fails. */
export async function aiMove(fen: string, level: Level): Promise<AiChoice> {
  try { return { uci: await engineMove(fen, level), degraded: false } } catch {
    const ranked = rankMoves(fen)
    if (ranked.length === 0) throw new Error('no legal moves')
    // Easy blunders a bit more; Hard plays the heuristic's top choice.
    const m = ranked[Math.min(ranked.length - 1, Math.floor(Math.random() * LEVELS[level].pick))]
    return { uci: `${m.from}${m.to}${m.promotion ?? ''}`, degraded: true }
  }
}

async function engineMove(fen: string, level: Level): Promise<string> {
  return pickEngineMove((f, o) => engine.search(f, o), fen, level)
}

export type SearchFn = (fen: string, opts: SearchOpts) => Promise<EngineLine[]>

/** The move-picking rule for a level, independent of where the engine runs (the app's worker, or the strength-measuring harness). */
export async function pickEngineMove(search: SearchFn, fen: string, level: Level): Promise<string> {
  const cfg = LEVELS[level]
  const legal = new Chess(fen).moves({ verbose: true })
  if (legal.length === 0) throw new Error('no legal moves')
  const lines = await search(fen, { multiPv: Math.min(cfg.pick, legal.length), depth: cfg.depth, skill: cfg.skill, movetime: cfg.movetime })
  const pool = lines.filter(l => l.uci).slice(0, cfg.pick)
  if (pool.length === 0) { const m = legal[0]; return `${m.from}${m.to}${m.promotion ?? ''}` }
  // Weighted toward the engine's top choice, but lower levels may play the 2nd/3rd best.
  const weights = pool.map((_, i) => 1 / (i + 1) ** 1.2)
  let r = Math.random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i].uci }
  return pool[0].uci
}
