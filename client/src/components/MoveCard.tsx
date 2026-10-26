import { motion } from 'framer-motion'
import { forwardRef } from 'react'
import type { Card } from '../engine/hand'

const FILES = 'abcdefgh'

/** Mini 8x8 diagram of the move, drawn like the card art in the mockup. */
function Diagram({ card }: { card: Card }) {
  const f = (s: string) => ({ x: FILES.indexOf(s[0]), y: 8 - Number(s[1]) })
  const a = f(card.from), b = f(card.to)
  const A = { x: a.x + .5, y: a.y + .5 }, B = { x: b.x + .5, y: b.y + .5 }
  const knight = Math.abs((b.x - a.x) * (b.y - a.y)) === 2
  const corner = knight ? (Math.abs(b.y - a.y) === 2 ? { x: A.x, y: B.y } : { x: B.x, y: A.y }) : null
  const d = corner ? `M${A.x},${A.y} L${corner.x},${corner.y} L${B.x},${B.y}` : `M${A.x},${A.y} L${B.x},${B.y}`
  const cells = []
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) cells.push(<rect key={`${x}${y}`} x={x} y={y} width="1" height="1" fill={(x + y) % 2 ? '#8b7347' : '#e6d6a8'} />)
  return (
    <svg viewBox="0 0 8 8" className="w-full h-full rounded-[3px]" style={{ boxShadow: '0 0 0 1px #7a5a1c' }}>
      {cells}
      <path d={d} fill="none" stroke="#ffb400" strokeWidth=".32" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="0.01 .55" />
      <path d={d} fill="none" stroke="#ffb400" strokeWidth=".18" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />
      <circle cx={A.x} cy={A.y} r=".3" fill="#fff6cf" stroke="#c88a00" strokeWidth=".1" />
      <circle cx={B.x} cy={B.y} r=".42" fill="rgba(255,180,0,.35)" stroke="#ffb400" strokeWidth=".14" />
    </svg>
  )
}

interface Props { card: Card; selected: boolean; onSelect: () => void; index: number; total: number; compact?: boolean; showBest?: boolean }

export const MoveCard = forwardRef<HTMLButtonElement, Props>(function MoveCard({ card, selected, onSelect, index, total, compact, showBest }, ref) {
  const mid = (total - 1) / 2
  const fan = (index - mid) * (compact ? 0 : 3.2)
  return (
    <motion.button
      ref={ref} type="button" data-card={card.san} aria-pressed={selected} onClick={onSelect}
      className={`hand-card ${selected ? 'card-selected' : ''} relative shrink-0 text-left outline-none focus-visible:ring-4 ring-gold-400 rounded-[14px]`}
      style={{ zIndex: selected ? 20 : index, transformOrigin: '50% 120%' }}
      initial={{ y: 220, opacity: 0, rotate: -12, scale: .8 }}
      animate={{ y: selected ? -26 : 0, opacity: 1, rotate: selected ? 0 : fan, scale: selected ? 1.06 : 1 }}
      exit={{ y: -260, opacity: 0, scale: .6, transition: { duration: .3 } }}
      whileHover={{ y: selected ? -30 : -14, scale: 1.04, rotate: 0 }}
      whileTap={{ scale: .97 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24, delay: selected ? 0 : index * .07 }}
    >
      <div className="card-face w-full h-full flex flex-col items-center px-[8%] pt-[6%] pb-[5%]">
        <div className="text-[clamp(10px,1.05vw,14px)] font-bold tracking-[.18em] uppercase">{card.title}</div>
        <div className="flex-1 min-h-0 w-full flex items-center justify-center">
          <img src={`/pieces/${card.color}${card.piece.toUpperCase()}.svg`} alt="" draggable={false} className="h-[92%] w-auto" style={{ filter: 'drop-shadow(0 4px 4px rgba(60,35,10,.5))' }} />
        </div>
        <div className="w-[62%] aspect-square mb-[4%]"><Diagram card={card} /></div>
        <div className="text-[clamp(14px,1.5vw,21px)] font-black leading-none">{card.san}</div>
        {(showBest || card.captured) && (
          <div className="absolute bottom-[5%] right-[7%] flex gap-1 text-[9px] sm:text-[10px] font-bold">
            {card.captured && <span className="px-1.5 rounded bg-red-800/80 text-red-100">x</span>}
            {showBest && <span className="px-1.5 rounded bg-emerald-700/90 text-emerald-50">{card.evalLabel}</span>}
          </div>
        )}
      </div>
    </motion.button>
  )
})

export function CardBack({ compact, loading }: { compact?: boolean; loading?: boolean }) {
  return (
    <div className={`card-back relative overflow-hidden shrink-0 ${compact ? '' : 'hand-card'}`} style={{ ...(compact ? { width: 112, aspectRatio: '0.68' } : {}), backgroundImage: "url('/assets/card-back.webp')", backgroundSize: 'cover' }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <img src="/pieces/wN.svg" alt="" className="w-1/2 opacity-70" style={{ filter: 'sepia(1) saturate(3) brightness(1.2)' }} />
      </div>
      {loading && <div className="absolute inset-0 shimmer" />}
    </div>
  )
}
