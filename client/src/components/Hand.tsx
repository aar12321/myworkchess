import { AnimatePresence } from 'framer-motion'
import type { Card } from '../engine/hand'
import { MoveCard, CardBack } from './MoveCard'

interface Props { cards: Card[] | null; selectedId: string | null; onSelect: (id: string) => void; waiting: boolean; showBest: boolean }

export function Hand({ cards, selectedId, onSelect, waiting, showBest }: Props) {
  return (
    <div className="relative h-full w-full flex items-end">
      {/* A fanned, overlapping hand; five cards fit across a phone. */}
      <div className="w-full flex items-end justify-center pt-7 pb-1">
        {cards && cards.length > 0 ? (
          <AnimatePresence mode="popLayout">
            {cards.map((c, i) => (
              <MoveCard key={c.id} card={c} index={i} total={cards.length} selected={selectedId === c.id} onSelect={() => onSelect(c.id)} compact={false} showBest={showBest} />
            ))}
          </AnimatePresence>
        ) : (
          Array.from({ length: waiting ? 5 : 0 }, (_, i) => <CardBack key={i} loading />)
        )}
      </div>
    </div>
  )
}
