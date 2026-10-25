import { useEffect, useRef } from 'react'

export function MoveHistory({ sans, current, onJump }: { sans: string[]; current?: number; onJump?: (ply: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }) }, [sans.length])
  const rows = []
  for (let i = 0; i < sans.length; i += 2) rows.push(i)
  const cell = (ply: number) => sans[ply] !== undefined && (
    <button disabled={!onJump} onClick={() => onJump?.(ply + 1)} className={`text-left px-2 py-0.5 rounded ${current === ply + 1 ? 'bg-gold-500/30 text-gold-300' : ''} ${onJump ? 'hover:bg-white/10' : ''}`}>{sans[ply]}</button>
  )
  return (
    <div className="panel p-3 flex flex-col min-h-0 h-full" data-testid="move-history">
      <div className="font-display text-center text-sm tracking-[.2em] text-gold-300 pb-2 border-b border-gold-500/30">MOVE HISTORY</div>
      <div ref={ref} className="flex-1 overflow-y-auto scroll-hide mt-2 text-lg">
        {rows.length === 0 && <div className="text-center text-parch-300/60 mt-4 text-base">No moves yet</div>}
        {rows.map(i => (
          <div key={i} className="grid grid-cols-[2rem_1fr_1fr] items-center">
            <span className="text-parch-300/60 text-sm pl-1">{i / 2 + 1}.</span>{cell(i)}{cell(i + 1)}
          </div>
        ))}
      </div>
    </div>
  )
}
