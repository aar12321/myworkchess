/** Shown only on phones held sideways (short landscape screens), where the game layout has no room. */
export function RotateHint() {
  return (
    <div className="rotate-hint fixed inset-0 z-[60] items-center justify-center flex-col gap-3 bg-black/90 text-center p-6" role="status">
      <div className="text-5xl">📱</div>
      <div className="font-display font-bold text-xl gold-text">Turn your phone upright</div>
      <p className="text-parch-200 max-w-xs">The board and your cards need the extra height. Rotate back to portrait to keep playing.</p>
    </div>
  )
}
