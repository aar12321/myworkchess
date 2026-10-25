import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { api, type GameSummary, type User } from '../api'

export const resultLabel = (g: GameSummary, me: User) => {
  const iAmWhite = g.whiteId === me.id
  if (g.result === '1/2-1/2') return { text: 'Draw', cls: 'text-parch-200' }
  const won = (g.result === '1-0') === iAmWhite
  return won ? { text: 'Won', cls: 'text-emerald-300' } : { text: 'Lost', cls: 'text-red-300' }
}

export function History({ user, onOpen, onBack }: { user: User; onOpen: (id: number) => void; onBack: () => void }) {
  const [games, setGames] = useState<GameSummary[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.listGames().then(setGames).catch(e => setErr(e.message)) }, [])
  return (
    <div className="min-h-[100dvh] table-bg px-4 py-5">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-5"><button className="btn-ghost" onClick={onBack}>← Lobby</button><h1 className="font-display font-black text-2xl gold-text">My games</h1><span className="w-20" /></div>
        {err && <div role="alert" className="text-red-300">{err}</div>}
        {games && games.length === 0 && <div className="panel p-8 text-center text-parch-200">No finished games yet. Play one and it will be recorded here.</div>}
        <div className="flex flex-col gap-3" data-testid="game-list">
          {games?.map((g, i) => {
            const r = resultLabel(g, user)
            return (
              <motion.button key={g.id} data-game-id={g.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .04 }} whileHover={{ x: 6 }} onClick={() => onOpen(g.id)} className="panel p-4 text-left flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-display font-bold">{g.whiteLabel} <span className="text-parch-300/70">vs</span> {g.blackLabel}</div>
                  <div className="text-sm text-parch-300">{g.mode === 'pvp' ? 'Friend game' : `vs computer (${g.mode.replace('ai-', '')})`} · {g.termination} · {new Date(g.endedAt).toLocaleString()}</div>
                </div>
                <div className={`font-display font-black text-xl ${r.cls}`}>{r.text}</div>
              </motion.button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
