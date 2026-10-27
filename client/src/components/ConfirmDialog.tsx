import { motion } from 'framer-motion'
import { useEffect } from 'react'

interface Props { title: string; body?: string; confirmLabel?: string; cancelLabel?: string; onConfirm: () => void; onCancel: () => void }

/** In-app replacement for window.confirm (which some in-app browsers suppress). */
export function ConfirmDialog({ title, body, confirmLabel = 'Yes', cancelLabel = 'Cancel', onConfirm, onCancel }: Props) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onCancel])
  return (
    <motion.div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onCancel}>
      <motion.div role="alertdialog" aria-modal="true" aria-label={title} className="panel w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}
        initial={{ scale: .85, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}>
        <h2 className="font-display font-black text-xl gold-text">{title}</h2>
        {body && <p className="mt-2 text-parch-200">{body}</p>}
        <div className="mt-5 flex gap-3 justify-center">
          <button className="btn-ghost" data-testid="confirm-no" onClick={onCancel}>{cancelLabel}</button>
          <button className="btn-gold !py-2" data-testid="confirm-yes" autoFocus onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </motion.div>
    </motion.div>
  )
}
