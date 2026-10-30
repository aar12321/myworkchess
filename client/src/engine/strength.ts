import type { Level } from './ai'
import data from './strength.json'

// Results of engine-vs-engine matches between the levels, produced by e2e-tools/measure-strength.mjs.
interface Pair { wins: number; draws: number; losses: number; games: number } // from the stronger level's point of view
interface Strength { measured: boolean; measuredOn?: string; pairs?: Record<string, Pair> }
const s = data as Strength

/** A plain-language, measured description of how a level compares with the one below it, or null if not measured. */
export function strengthNote(level: Level): string | null {
  if (!s.measured || !s.pairs) return null
  const vs = level === 'medium' ? 'easy' : level === 'hard' ? 'medium' : null
  if (!vs) return 'Starting point'
  const p = s.pairs[`${level}-vs-${vs}`]
  if (!p) return null
  const label = vs[0].toUpperCase() + vs.slice(1)
  return `Won ${p.wins} of ${p.games} games against ${label}${p.draws ? ` (${p.draws} drawn)` : ''}`
}
