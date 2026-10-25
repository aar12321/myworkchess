import { motion } from 'framer-motion'
import { useState } from 'react'
import type { User } from '../api'
import { LEVELS, type Level } from '../engine/ai'
import { Avatar } from '../components/PlayerBar'

export type GameSetup =
  | { kind: 'ai'; level: Level; color: 'w' | 'b' }
  | { kind: 'create'; minutes: number; color: 'w' | 'b' | 'random' }
  | { kind: 'join'; code: string }

interface Props { user: User; onStart: (s: GameSetup) => void; onHistory: () => void; onLogout: () => void; initialCode?: string }

export function Lobby({ user, onStart, onHistory, onLogout, initialCode }: Props) {
  const [color, setColor] = useState<'w' | 'b' | 'random'>('w')
  const [minutes, setMinutes] = useState(10)
  const [code, setCode] = useState(initialCode ?? '')
  const resolve = (c: 'w' | 'b' | 'random') => (c === 'random' ? (Math.random() < .5 ? 'w' : 'b') : c)
  const Colors = (
    <div className="flex gap-2" role="radiogroup" aria-label="Your colour">
      {([['w', 'White'], ['b', 'Black'], ['random', 'Random']] as const).map(([v, l]) => (
        <button key={v} role="radio" aria-checked={color === v} onClick={() => setColor(v)} className={`flex-1 py-2 rounded-lg font-display text-xs tracking-widest uppercase border ${color === v ? 'bg-gold-500 text-bark-900 border-gold-300' : 'bg-black/30 border-gold-500/30'}`}>{l}</button>
      ))}
    </div>
  )
  const rise = (i: number) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { delay: .08 * i, type: 'spring' as const, stiffness: 200, damping: 22 } })

  return (
    <div className="min-h-[100dvh] table-bg px-4 py-5 pb-12">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3"><Avatar name={user.username} size={48} active /><div><div className="text-sm text-parch-300">Welcome back</div><div className="font-display font-bold text-lg" data-testid="whoami">{user.username}</div></div></div>
          <div className="flex gap-2"><button className="btn-ghost" onClick={onHistory}>My games</button><button className="btn-ghost" onClick={onLogout}>Sign out</button></div>
        </header>

        <motion.h1 {...rise(0)} className="font-display font-black text-4xl sm:text-5xl text-center gold-text mb-1">Knight's Hand</motion.h1>
        <motion.p {...rise(1)} className="text-center text-parch-200 mb-8">Each turn you're dealt the five best moves. Choose wisely.</motion.p>

        <motion.section {...rise(2)} className="panel p-5 mb-5">
          <h2 className="font-display text-xl text-gold-300 mb-1">Play the computer</h2>
          <p className="text-parch-300 text-sm mb-3">Play as</p>
          <div className="max-w-sm mb-4">{Colors}</div>
          <div className="grid sm:grid-cols-3 gap-3">
            {(Object.keys(LEVELS) as Level[]).map((lv, i) => (
              <motion.button key={lv} data-testid={`ai-${lv}`} whileHover={{ y: -6, scale: 1.02 }} whileTap={{ scale: .97 }} onClick={() => onStart({ kind: 'ai', level: lv, color: resolve(color) })}
                className="card-face text-left p-4 cursor-pointer" style={{ minHeight: 120 }}>
                <div className="flex items-center justify-between"><span className="font-black text-xl">{LEVELS[lv].label}</span><span className="text-xs font-bold opacity-70">{LEVELS[lv].elo}</span></div>
                <div className="flex gap-1 my-1">{[0, 1, 2].map(n => <span key={n} className={n <= i ? 'text-amber-700' : 'text-stone-400/60'}>♞</span>)}</div>
                <p className="text-sm font-body font-semibold leading-snug">{LEVELS[lv].blurb}</p>
              </motion.button>
            ))}
          </div>
        </motion.section>

        <div className="grid md:grid-cols-2 gap-5">
          <motion.section {...rise(3)} className="panel p-5">
            <h2 className="font-display text-xl text-gold-300 mb-3">Host a game</h2>
            <p className="text-parch-300 text-sm mb-1">Your colour</p><div className="mb-3">{Colors}</div>
            <p className="text-parch-300 text-sm mb-1">Time per side</p>
            <div className="flex gap-2 mb-4">{[3, 5, 10, 15].map(m => <button key={m} onClick={() => setMinutes(m)} className={`flex-1 py-2 rounded-lg font-display border ${minutes === m ? 'bg-gold-500 text-bark-900 border-gold-300' : 'bg-black/30 border-gold-500/30'}`}>{m}m</button>)}</div>
            <button className="btn-gold w-full" data-testid="create-room" onClick={() => onStart({ kind: 'create', minutes, color })}>Create room</button>
            <p className="text-xs text-parch-300/80 mt-2">You'll get a 6-letter code to share with your friend.</p>
          </motion.section>

          <motion.section {...rise(4)} className="panel p-5">
            <h2 className="font-display text-xl text-gold-300 mb-3">Join a friend</h2>
            <label htmlFor="code" className="text-parch-300 text-sm mb-1 block">Room code</label>
            <input id="code" className="input text-center font-display tracking-[.4em] text-2xl uppercase mb-4" maxLength={6} value={code} placeholder="ABC123" autoCapitalize="characters" autoComplete="off" onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            <button className="btn-gold w-full" data-testid="join-room" disabled={code.length !== 6} onClick={() => onStart({ kind: 'join', code })}>Join room</button>
          </motion.section>
        </div>
      </div>
    </div>
  )
}
