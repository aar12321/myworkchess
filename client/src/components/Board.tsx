import { motion } from 'framer-motion'
import { useMemo } from 'react'
import type { Move } from 'chess.js'
import { trackPieces } from '../tracker'
import type { Card } from '../engine/hand'

interface Props {
  moves: Move[]
  upto?: number
  orientation: 'w' | 'b'
  selected?: Card | null
  inCheckColor?: 'w' | 'b' | null
}

const FILES = 'abcdefgh'
const sqXY = (sq: string, o: 'w' | 'b') => {
  const f = FILES.indexOf(sq[0]), r = Number(sq[1]) - 1
  return o === 'w' ? { x: f, y: 7 - r } : { x: 7 - f, y: r }
}

export function Board({ moves, upto = moves.length, orientation, selected, inCheckColor }: Props) {
  const pieces = useMemo(() => trackPieces(moves, upto), [moves, upto])
  const last = upto > 0 ? moves[upto - 1] : null
  const kingSq = inCheckColor ? pieces.find(p => p.type === 'k' && p.color === inCheckColor && !p.captured)?.square : null

  const squares = []
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const f = orientation === 'w' ? x : 7 - x, r = orientation === 'w' ? 7 - y : y
    const sq = FILES[f] + (r + 1)
    const light = (f + r) % 2 === 1
    const isSel = selected && (sq === selected.from || sq === selected.to)
    const isLast = last && (sq === last.from || sq === last.to)
    squares.push(
      <div key={sq} data-square={sq} className={`relative ${light ? 'sq-light' : 'sq-dark'} ${kingSq === sq ? 'pulse-red' : ''}`}>
        {isLast && !isSel && <div className="absolute inset-0 bg-amber-300/25" />}
        {isSel && <motion.div layoutId={undefined} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0"
          style={{ background: 'rgba(255,200,40,.35)', boxShadow: 'inset 0 0 0 2px #ffd75e, inset 0 0 14px 2px rgba(255,200,60,.8)' }} />}
        {x === 0 && <span className={`absolute left-[3%] top-[2%] text-[clamp(7px,1.4vmin,12px)] font-bold ${light ? 'text-stone-600' : 'text-stone-300'}`}>{r + 1}</span>}
        {y === 7 && <span className={`absolute right-[4%] bottom-[1%] text-[clamp(7px,1.4vmin,12px)] font-bold ${light ? 'text-stone-600' : 'text-stone-300'}`}>{FILES[f]}</span>}
      </div>
    )
  }

  const arrow = selected && (() => {
    const a = sqXY(selected.from, orientation), b = sqXY(selected.to, orientation)
    const A = { x: a.x + .5, y: a.y + .5 }, B = { x: b.x + .5, y: b.y + .5 }
    const dx = b.x - a.x, dy = b.y - a.y
    const knight = Math.abs(dx * dy) === 2
    // Knights get the L-shaped path from the card art; everything else is straight.
    const corner = knight ? (Math.abs(dy) === 2 ? { x: A.x, y: B.y } : { x: B.x, y: A.y }) : null
    const len = Math.hypot(B.x - (corner?.x ?? A.x), B.y - (corner?.y ?? A.y)) || 1
    const ux = (B.x - (corner?.x ?? A.x)) / len, uy = (B.y - (corner?.y ?? A.y)) / len
    const tip = { x: B.x - ux * .12, y: B.y - uy * .12 }
    const head = [`${tip.x},${tip.y}`, `${tip.x - ux * .3 - uy * .2},${tip.y - uy * .3 + ux * .2}`, `${tip.x - ux * .3 + uy * .2},${tip.y - uy * .3 - ux * .2}`].join(' ')
    const end = { x: tip.x - ux * .22, y: tip.y - uy * .22 }
    const d = corner ? `M${A.x},${A.y} L${corner.x},${corner.y} L${end.x},${end.y}` : `M${A.x},${A.y} L${end.x},${end.y}`
    return { d, head, key: selected.id }
  })()

  return (
    <div className="board-frame w-full h-full board-tilt">
      <div className="relative w-full h-full rounded-[6px] overflow-hidden" style={{ boxShadow: '0 0 0 2px rgba(0,0,0,.6)' }}>
        <div className="grid grid-cols-8 grid-rows-8 w-full h-full">{squares}</div>

        <div className="absolute inset-0 pointer-events-none">
          {pieces.map(p => {
            const { x, y } = sqXY(p.square, orientation)
            return (
              <motion.img
                key={p.id} src={`/pieces/${p.color}${p.type.toUpperCase()}.svg`} alt="" draggable={false}
                data-piece={`${p.color}${p.type}`} data-sq={p.captured ? undefined : p.square}
                className="absolute select-none"
                style={{ width: '12.5%', height: '12.5%', filter: 'drop-shadow(0 4px 3px rgba(0,0,0,.55))', zIndex: p.captured ? 1 : 2 }}
                initial={false}
                animate={{ left: `${x * 12.5}%`, top: `${y * 12.5}%`, opacity: p.captured ? 0 : 1, scale: p.captured ? 0.2 : 1, rotate: p.captured ? 40 : 0 }}
                transition={{ left: { type: 'spring', stiffness: 260, damping: 26 }, top: { type: 'spring', stiffness: 260, damping: 26 }, opacity: { duration: .35, delay: p.captured ? .12 : 0 }, scale: { duration: .4, delay: p.captured ? .12 : 0 }, rotate: { duration: .4 } }}
              />
            )
          })}
        </div>

        {arrow && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 8 8" style={{ zIndex: 5, filter: 'drop-shadow(0 0 .08px #ffcf40) drop-shadow(0 0 .2px rgba(255,200,60,.9))' }}>
            <motion.path key={arrow.key} d={arrow.d} fill="none" stroke="#ffd75e" strokeWidth=".12" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .45, ease: 'easeOut' }} />
            <motion.polygon key={arrow.key + 'h'} points={arrow.head} fill="#ffd75e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .35 }} />
          </svg>
        )}
      </div>
    </div>
  )
}
