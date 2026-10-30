import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import type { Move } from 'chess.js'
import type { Card } from '../engine/hand'
import { Board } from './Board'
import { Hand } from './Hand'
import { CardBack } from './MoveCard'
import { MoveHistory } from './MoveHistory'
import { PlayerBar, type PlayerInfo } from './PlayerBar'
import { isMuted, setMuted, sfx } from '../sfx'
import { RotateHint } from './RotateHint'
import { describeCard, describeMove } from '../a11y'

export interface Action { label: string; onClick: () => void; testId?: string; disabled?: boolean }

function useWide() {
  const q = '(min-width: 640px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => { const m = window.matchMedia(q); const f = () => setWide(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  return wide
}

/** Game actions (Resign, Draw…). Inline on wide screens; several actions collapse into a "⋯" menu on phones so the header never overflows. */
function Actions({ actions }: { actions: Action[] }) {
  const wide = useWide()
  const [open, setOpen] = useState(false)
  if (actions.length === 0) return null
  if (wide || actions.length === 1) return <>{actions.map(a => <button key={a.label} className="btn-ghost whitespace-nowrap" data-testid={a.testId} disabled={a.disabled} onClick={a.onClick}>{a.label}</button>)}</>
  return (
    <div className="relative">
      <button className="btn-ghost" data-testid="game-menu" aria-haspopup="menu" aria-expanded={open} aria-label="Game menu" onClick={() => setOpen(o => !o)}>⋯</button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className="panel absolute right-0 top-full mt-1 z-40 p-2 flex flex-col gap-2 min-w-[150px]">
            {actions.map(a => <button key={a.label} role="menuitem" className="btn-ghost !min-h-[44px] text-left" data-testid={a.testId} disabled={a.disabled} onClick={() => { setOpen(false); a.onClick() }}>{a.label}</button>)}
          </div>
        </>
      )}
    </div>
  )
}

interface Props {
  moves: Move[]
  orientation: 'w' | 'b'
  turn: 'w' | 'b'
  inCheck: boolean
  top: PlayerInfo
  bottom: PlayerInfo
  cards: Card[] | null
  myTurn: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onPlay: () => void
  statusTitle: string
  statusSub: string
  showBest: boolean
  onBack: () => void
  actions?: Action[]
  overlay?: ReactNode
  boardOverlay?: ReactNode
  notice?: string
  resultText?: string // e.g. "You won. Checkmate.", announced to screen readers
}

export function GameLayout(p: Props) {
  const [drawer, setDrawer] = useState(false)
  const [muted, setM] = useState(isMuted())
  const selected = p.cards?.find(c => c.id === p.selectedId) ?? null
  const sans = p.moves.map(m => m.san)

  // Screen-reader announcements: each move in words, then the dealt cards, then the result. (Polite, so they queue.)
  const [live, setLive] = useState('')
  useEffect(() => { const m = p.moves[p.moves.length - 1]; if (m) setLive(`${describeMove(m)}.`) }, [p.moves.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (p.myTurn && p.cards && p.cards.length > 0) setLive(`Your turn. ${p.cards.length} move cards: ${p.cards.map(describeCard).join('; ')}.`) }, [p.cards]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (p.resultText) setLive(`Game over. ${p.resultText}`) }, [p.resultText])

  return (
    <div className="h-[100dvh] flex flex-col table-bg overflow-hidden" style={{ paddingBottom: 'var(--safe-b)' }}>
      <header className="safe-x safe-t relative flex items-center justify-between px-2 sm:px-3 py-1 sm:py-2 gap-2">
        <button className="btn-ghost whitespace-nowrap" onClick={p.onBack} aria-label="Back to lobby">←<span className="hidden sm:inline"> Lobby</span></button>
        <div className="lg:hidden whitespace-nowrap font-display text-xs sm:text-sm text-gold-300 text-center px-3 py-1 rounded-full border border-gold-500/50 bg-black/50" data-testid="status-mobile">
          {p.statusTitle}
        </div>
        <div className="flex gap-1.5 sm:gap-2">
          <button className="btn-ghost lg:hidden" onClick={() => setDrawer(true)}>Moves</button>
          <button className="btn-ghost" onClick={() => { setMuted(!muted); setM(!muted) }} aria-label="Toggle sound">{muted ? '🔇' : '🔊'}</button>
          <Actions actions={p.actions ?? []} />
        </div>
      </header>

      {p.notice && <div role="status" className="mx-3 mb-1 text-center text-xs sm:text-sm text-amber-100 bg-amber-900/80 border border-amber-500/40 rounded-lg py-1 px-2">{p.notice}</div>}
      <div className="flex-1 min-h-0 flex gap-4 px-1 sm:px-3 lg:px-6">
        <aside className="hidden lg:block w-60 xl:w-72 py-2 self-stretch max-h-[420px] mt-10"><MoveHistory sans={sans} /></aside>

        <section className="flex-1 min-w-0 min-h-0 flex flex-col">
          <PlayerBar p={p.top} />
          <div className="flex-1 min-h-0 relative" style={{ containerType: 'size' }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative" style={{ width: 'min(100cqw, 100cqh)', height: 'min(100cqw, 100cqh)' }} data-testid="board">
                <Board moves={p.moves} orientation={p.orientation} selected={selected} inCheckColor={p.inCheck ? p.turn : null} />
                {p.boardOverlay}
              </div>
            </div>
          </div>
          <PlayerBar p={p.bottom} />
        </section>

        <aside className="hidden lg:flex w-60 xl:w-72 flex-col items-center justify-start mt-10 gap-4">
          <div className="panel w-full px-5 py-6 text-center" data-testid="status-panel">
            <motion.div key={p.statusTitle} initial={{ opacity: 0, y: -12, scale: .95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
              <div className="text-3xl mb-1">♞</div>
              <div className={`font-display font-black text-2xl ${p.myTurn ? 'gold-text' : 'text-parch-200'}`}>{p.statusTitle}</div>
              <div className="text-parch-200/90 mt-1">{p.statusSub}</div>
            </motion.div>
          </div>
        </aside>
      </div>

      <footer className="relative px-2 lg:px-6 pt-1 pb-2 flex flex-col lg:flex-row lg:items-end gap-1 lg:gap-6 hand-footer shrink-0">
        <div className="hidden lg:block w-40 shrink-0 pb-3">
          <div className="relative w-[120px]" style={{ aspectRatio: '0.68' }}>
            {[3, 2, 1, 0].map(i => <div key={i} className="absolute" style={{ left: i * 3, top: -i * 3 }}><CardBack compact /></div>)}
          </div>
        </div>
        <div className="flex-1 min-w-0 h-full order-2 lg:order-none"><Hand cards={p.cards} selectedId={p.selectedId} onSelect={id => { if (p.selectedId !== id) sfx.select(); p.onSelect(p.selectedId === id ? null : id) }} waiting={p.myTurn} showBest={p.showBest} /></div>
        <div className="shrink-0 lg:w-56 flex lg:justify-end lg:pb-6 order-1 lg:order-none px-2 pt-1">
          <button className="btn-gold w-full lg:w-auto lg:min-w-[190px] !py-2 !min-h-[44px] lg:!py-[.85rem] lg:!min-h-[48px]" data-testid="play-move" disabled={!p.myTurn || !selected} onClick={p.onPlay}>
            {selected ? `Play ${selected.san}` : 'Play Move'}
          </button>
        </div>
      </footer>

      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-40 bg-black/60 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)}>
            <motion.div className="absolute bottom-0 inset-x-0 h-[55dvh] p-3" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 280, damping: 30 }} onClick={e => e.stopPropagation()}>
              <MoveHistory sans={sans} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="live">{live}</div>
      {p.overlay}
      <RotateHint />
    </div>
  )
}
