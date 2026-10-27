import { useEffect, useMemo, useState } from 'react'
import { api, type GameFull, type User } from '../api'
import { Board } from '../components/Board'
import { MoveHistory } from '../components/MoveHistory'
import { Avatar } from '../components/PlayerBar'
import { movesFromPgn } from '../tracker'
import { sfx } from '../sfx'
import { RotateHint } from '../components/RotateHint'

export function Replay({ id, user, onBack }: { id: number; user: User; onBack: () => void }) {
  const [game, setGame] = useState<GameFull | null>(null)
  const [err, setErr] = useState('')
  const [ply, setPly] = useState(0)
  const [auto, setAuto] = useState(false)
  useEffect(() => { api.getGame(id).then(g => { setGame(g); setPly(0) }).catch(e => setErr(e.message)) }, [id])
  const moves = useMemo(() => (game ? movesFromPgn(game.pgn) : []), [game])
  const orientation = game && game.blackId === user.id ? 'b' : 'w'
  const [copied, setCopied] = useState(false)
  const copyPgn = async () => { try { await navigator.clipboard.writeText(game!.pgn); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { window.prompt('Copy the PGN:', game!.pgn) } }
  const downloadPgn = () => {
    const url = URL.createObjectURL(new Blob([game!.pgn + '\n'], { type: 'application/x-chess-pgn' }))
    const a = document.createElement('a'); a.href = url; a.download = `knights-hand-${game!.id}.pgn`; a.click(); URL.revokeObjectURL(url)
  }

  const go = (n: number) => setPly(p => { const v = Math.max(0, Math.min(moves.length, typeof n === 'number' ? n : p)); if (v !== p && v > 0) (moves[v - 1].captured ? sfx.capture : sfx.move)(); return v })
  useEffect(() => {
    if (!auto) return
    if (ply >= moves.length) { setAuto(false); return }
    const t = setTimeout(() => go(ply + 1), 900)
    return () => clearTimeout(t)
  }, [auto, ply, moves.length])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(ply + 1); if (e.key === 'ArrowLeft') go(ply - 1) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })

  if (err) return <div className="min-h-[100dvh] table-bg p-6"><button className="btn-ghost" onClick={onBack}>← Back</button><p role="alert" className="mt-4 text-red-300">{err}</p></div>
  if (!game) return <div className="min-h-[100dvh] table-bg flex items-center justify-center font-display text-gold-300">Loading…</div>
  const top = orientation === 'w' ? { n: game.blackLabel } : { n: game.whiteLabel }
  const bottom = orientation === 'w' ? { n: game.whiteLabel } : { n: game.blackLabel }

  return (
    <div className="h-[100dvh] table-bg flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2"><button className="btn-ghost" onClick={onBack}>← Back</button>
        <div className="font-display text-gold-300 text-sm sm:text-base text-center">{game.result} · {game.termination}</div><span className="w-20" /></header>
      <div className="flex-1 min-h-0 flex gap-4 px-3 lg:px-8 pb-2">
        <aside className="hidden lg:block w-64 max-h-[480px] self-center"><MoveHistory sans={moves.map(m => m.san)} current={ply} onJump={setPly} /></aside>
        <section className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-center gap-2 py-1"><Avatar name={top.n} size={40} /><b className="font-display">{top.n}</b></div>
          <div className="flex-1 min-h-0 relative" style={{ containerType: 'size' }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <div style={{ width: 'min(100cqw, 100cqh)', height: 'min(100cqw, 100cqh)' }} data-testid="replay-board"><Board moves={moves} upto={ply} orientation={orientation} /></div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 py-1"><Avatar name={bottom.n} size={40} /><b className="font-display">{bottom.n}</b></div>
        </section>
      </div>
      <footer className="px-3 pb-4 pt-2 flex flex-col items-center gap-2" style={{ paddingBottom: 'calc(1rem + var(--safe-b))' }}>
        <div className="text-parch-200 text-sm" data-testid="ply-label">Move {ply} / {moves.length}{ply > 0 ? ` · ${moves[ply - 1].san}` : ''}</div>
        <input type="range" min={0} max={moves.length} value={ply} onChange={e => setPly(Number(e.target.value))} className="w-full max-w-xl accent-amber-500" aria-label="Move" />
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => go(0)} aria-label="First">⏮</button>
          <button className="btn-ghost" onClick={() => go(ply - 1)} aria-label="Previous">◀</button>
          <button className="btn-gold !py-2 !min-h-[44px]" onClick={() => { if (ply >= moves.length) setPly(0); setAuto(a => !a) }}>{auto ? 'Pause' : 'Play'}</button>
          <button className="btn-ghost" onClick={() => go(ply + 1)} aria-label="Next">▶</button>
          <button className="btn-ghost" onClick={() => go(moves.length)} aria-label="Last">⏭</button>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" data-testid="copy-pgn" onClick={copyPgn}>{copied ? 'Copied!' : 'Copy PGN'}</button>
          <button className="btn-ghost" data-testid="download-pgn" onClick={downloadPgn}>Download PGN</button>
        </div>
      </footer>
      <RotateHint />
    </div>
  )
}
