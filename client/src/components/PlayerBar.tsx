import { useEffect, useState } from 'react'

export interface PlayerInfo { name: string; color: 'w' | 'b'; clockMs: number | null; active: boolean; online?: boolean; sub?: string; avatar?: string }

export function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function Avatar({ name, src, size = 56, active }: { name: string; src?: string; size?: number | 'var'; active?: boolean }) {
  const dim = size === 'var' ? 'var(--av)' : `${size}px`
  const [bad, setBad] = useState(!src)
  useEffect(() => setBad(!src), [src])
  return (
    <div className={`rounded-full overflow-hidden shrink-0 flex items-center justify-center ${active ? 'glow-ring' : ''}`}
      style={{ width: dim, height: dim, boxShadow: active ? undefined : '0 0 0 3px #7a5a1c', background: 'radial-gradient(circle at 35% 30%, #6b4a2a, #2a1a0f)' }}>
      {bad ? <span className="font-display font-black gold-text" style={{ fontSize: `calc(${dim} * .45)` }}>{name.slice(0, 1).toUpperCase()}</span>
        : <img src={src} alt="" className="w-full h-full object-cover" onError={() => setBad(true)} />}
    </div>
  )
}

export function PlayerBar({ p, align = 'center' }: { p: PlayerInfo; align?: 'center' }) {
  const low = p.clockMs !== null && p.clockMs < 10_000 && p.active
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 py-0.5 sm:py-1 [--av:34px] sm:[--av:52px]" data-player={p.color} data-testid={`player-${p.color}`}>
      <Avatar name={p.name} src={p.avatar} size="var" active={p.active} />
      <div className="leading-tight min-w-0">
        <div className="font-display font-bold text-sm sm:text-base truncate max-w-[40vw]">{p.name}{p.online === false && <span className="ml-2 text-xs text-red-300">offline</span>}</div>
        {p.sub && <div className="text-xs text-parch-300/80">{p.sub}</div>}
      </div>
      {p.clockMs !== null && (
        <div data-testid={`clock-${p.color}`} className={`font-display font-black text-lg sm:text-2xl px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg border tabular-nums transition-colors ${low ? 'text-red-300 border-red-400 animate-pulse' : p.active ? 'text-gold-300 border-gold-400' : 'text-parch-200/70 border-white/10'}`}
          style={{ background: 'rgba(0,0,0,.55)' }}>
          {fmt(p.clockMs)}
        </div>
      )}
    </div>
  )
}
