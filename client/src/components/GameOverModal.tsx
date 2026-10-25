import { motion } from 'framer-motion'
import { useEffect, useMemo } from 'react'
import { sfx } from '../sfx'

interface Props { title: string; subtitle: string; won: boolean | null; onRematch?: () => void; onReview?: () => void; onLobby: () => void }

export function GameOverModal({ title, subtitle, won, onRematch, onReview, onLobby }: Props) {
  useEffect(() => { if (won === true) sfx.win(); else if (won === false) sfx.lose() }, [won])
  const embers = useMemo(() => Array.from({ length: won ? 28 : 0 }, (_, i) => ({ i, left: Math.random() * 100, dur: 3 + Math.random() * 3, dx: (Math.random() - .5) * 160, delay: Math.random() * 1.5 })), [won])
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="game-over">
      {embers.map(e => <span key={e.i} className="ember" style={{ left: `${e.left}%`, animationDuration: `${e.dur}s`, animationDelay: `${e.delay}s`, ['--dx' as string]: `${e.dx}px` }} />)}
      <motion.div className="panel w-full max-w-sm p-7 text-center" initial={{ scale: .6, y: 40, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
        <div className="text-5xl mb-2">{won === true ? '👑' : won === false ? '🥀' : '🤝'}</div>
        <h2 className="font-display font-black text-3xl gold-text">{title}</h2>
        <p className="mt-2 mb-6 text-parch-200">{subtitle}</p>
        <div className="flex flex-col gap-3">
          {onReview && <button className="btn-gold" onClick={onReview}>Review game</button>}
          {onRematch && <button className="btn-ghost" onClick={onRematch}>Rematch</button>}
          <button className="btn-ghost" onClick={onLobby}>Back to lobby</button>
        </div>
      </motion.div>
    </motion.div>
  )
}
