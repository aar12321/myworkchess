import type { Level } from './engine/ai'

// An unfinished game against the computer lives in localStorage so a refresh, crash or phone app-switch doesn't lose it.
export interface SavedAi { level: Level; color: 'w' | 'b'; minutes: number; pgn: string; clocks: { w: number; b: number } | null; startedAt: number; savedAt: number }

const key = (userId: number) => `mwc_ai_${userId}`
const MAX_AGE_MS = 12 * 3600_000

export function loadAi(userId: number): SavedAi | null {
  try {
    const v = JSON.parse(localStorage.getItem(key(userId)) || 'null') as SavedAi | null
    if (!v || typeof v.pgn !== 'string' || !['easy', 'medium', 'hard'].includes(v.level) || !['w', 'b'].includes(v.color)) return null
    if (Date.now() - v.savedAt > MAX_AGE_MS) { clearAi(userId); return null }
    return v
  } catch { return null }
}
export function saveAi(userId: number, v: Omit<SavedAi, 'savedAt'>) {
  try { localStorage.setItem(key(userId), JSON.stringify({ ...v, savedAt: Date.now() })) } catch { /* storage unavailable */ }
}
export function clearAi(userId: number) { try { localStorage.removeItem(key(userId)) } catch { /* ignore */ } }
