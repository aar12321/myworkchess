import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { sfx } from '../sfx'

interface Props {
  title: string; subtitle: string; won: boolean | null
  onRematch?: () => void; onReview?: () => void; onLobby: () => void
  saveStatus?: 'saving' | 'saved' | 'failed'; onRetrySave?: () => void
  rematchLabel?: string; rematchDisabled?: boolean
}

export function GameOverModal({ title, subtitle, won, onRematch, onReview, onLobby, saveStatus, onRetrySave, rematchLabel = 'Rematch', rematchDisabled }: Props) {
  const [open, setOpen] = useState(true)
  useEffect(() => { if (won === true) sfx.win(); else if (won === false) sfx.lose() }, [won])
  const embers = useMemo(() => Array.from({ length: won ? 28 : 0 }, (_, i) => ({ i, left: Math.random() * 100, dur: 3 + Math.random() * 3, dx: (Math.random() - .5) * 160, delay: Math.random() * 1.5 })), [won])

  if (!open) return (
    <button className="btn-gold fixed bottom-4 left-1/2 -translate-x-1/2 z-50 !py-2" data-testid="show-result" onClick={() => setOpen(true)}>Show result</button>
  )
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="game-over">
      {embers.map(e => <span key={e.i} className="ember" style={{ left: `${e.left}%`, animationDuration: `${e.dur}s`, animationDelay: `${e.delay}s`, ['--dx' as string]: `${e.dx}px` }} />)}
      <motion.div className="panel w-full max-w-sm p-7 text-center" initial={{ scale: .6, y: 40, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
        <div className="text-5xl mb-2">{won === true ? '👑' : won === false ? '🥀' : '🤝'}</div>
        <h2 className="font-display font-black text-3xl gold-text">{title}</h2>
        <p className="mt-2 mb-4 text-parch-200">{subtitle}</p>
        {saveStatus === 'saving' && <p className="mb-3 text-sm text-parch-300" role="status">Saving game…</p>}
        {saveStatus === 'failed' && (
          <p className="mb-3 text-sm text-red-200 bg-red-950/60 border border-red-500/40 rounded-lg px-3 py-2" role="alert">
            Couldn't save this game. <button className="underline font-bold" onClick={onRetrySave}>Retry</button>
          </p>
        )}
        <div className="flex flex-col gap-3">
          {onReview && <button className="btn-gold" onClick={onReview}>Review game</button>}
          <button className="btn-ghost" data-testid="view-board" onClick={() => setOpen(false)}>View board</button>
          {onRematch && <button className="btn-ghost disabled:opacity-60 disabled:cursor-not-allowed" data-testid="rematch" disabled={rematchDisabled} onClick={onRematch}>{rematchLabel}</button>}
          <button className="btn-ghost" onClick={onLobby}>Back to lobby</button>
        </div>
      </motion.div>
    </motion.div>
  )
}
