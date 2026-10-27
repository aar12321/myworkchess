import { motion } from 'framer-motion'
import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type User } from '../api'
import { clearAi, loadAi, saveAi } from '../aiSave'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { GameLayout } from '../components/GameLayout'
import { GameOverModal } from '../components/GameOverModal'
import type { PlayerInfo } from '../components/PlayerBar'
import { aiMove, LEVELS } from '../engine/ai'
import { buildHandFromLines, dealHand, type Card } from '../engine/hand'
import { sfx } from '../sfx'
import { getSocket } from '../socket'
import { movesFromPgn } from '../tracker'
import type { GameSetup } from './Lobby'

interface Props { user: User; setup: GameSetup; onExit: () => void; onReview: (id: number) => void; onRematch: (s: GameSetup) => void }

interface Outcome { result: '1-0' | '0-1' | '1/2-1/2'; termination: string }

const AVATARS = { w: '/assets/avatar-w.webp', b: '/assets/avatar-b.webp' }
const DEGRADED_NOTICE = 'Chess engine unavailable: cards and computer moves use a simpler method until it loads.'

/** Shared selection + dealing logic: deals a fresh hand whenever it becomes my turn on a new position. */
function useHand(fen: string, myTurn: boolean, depth = 9) {
  const [cards, setCards] = useState<Card[] | null>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [degraded, setDegraded] = useState(false)
  useEffect(() => {
    setSelectedId(null)
    if (!myTurn) { setCards([]); return }
    let live = true
    setCards(null)
    dealHand(fen, depth)
      .then(h => { if (live) { setCards(h.cards); if (h.degraded) setDegraded(true); sfx.deal() } })
      .catch(() => { if (live) { setCards(buildHandFromLines(fen, [])); setDegraded(true) } })
    return () => { live = false }
  }, [fen, myTurn, depth])
  return { cards, selectedId, setSelectedId, degraded }
}

export function Game(props: Props) {
  return props.setup.kind === 'ai' ? <AiGame {...props} setup={props.setup} /> : <PvpGame {...props} setup={props.setup} />
}

function outcomeOf(c: Chess): Outcome | null {
  if (c.isCheckmate()) return { result: c.turn() === 'w' ? '0-1' : '1-0', termination: 'checkmate' }
  if (c.isStalemate()) return { result: '1/2-1/2', termination: 'stalemate' }
  if (c.isInsufficientMaterial()) return { result: '1/2-1/2', termination: 'insufficient material' }
  if (c.isThreefoldRepetition()) return { result: '1/2-1/2', termination: 'repetition' }
  if (c.isDraw()) return { result: '1/2-1/2', termination: 'fifty-move rule' }
  return null
}

const cap = (s: string) => `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`

// ───────────────────────── AI game ─────────────────────────
function AiGame({ user, setup, onExit, onReview, onRematch }: Props & { setup: Extract<GameSetup, { kind: 'ai' }> }) {
  // A refresh / app switch mid-game resumes from localStorage (see aiSave.ts).
  const saved = useRef(setup.resume ? loadAi(user.id) : null)
  const me = saved.current?.color ?? setup.color
  const level = saved.current?.level ?? setup.level
  const minutes = saved.current ? saved.current.minutes : setup.minutes
  const chessRef = useRef<Chess | null>(null)
  if (!chessRef.current) {
    const c = new Chess()
    if (saved.current) { try { c.loadPgn(saved.current.pgn) } catch { /* corrupt save: start fresh */ } }
    chessRef.current = c
  }
  const chess = chessRef.current
  const startedAt = useRef(saved.current?.startedAt ?? Date.now())
  const [version, setVersion] = useState(0)
  const timed = minutes > 0
  const [clocks, setClocks] = useState<{ w: number; b: number } | null>(timed ? (saved.current?.clocks ?? { w: minutes * 60_000, b: minutes * 60_000 }) : null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [savedId, setSavedId] = useState<number | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'failed'>('saving')
  const [thinking, setThinking] = useState(false)
  const [aiDegraded, setAiDegraded] = useState(false)
  const [confirmResign, setConfirmResign] = useState(false)
  const payload = useRef<Parameters<typeof api.saveGame>[0] | null>(null)

  const fen = useMemo(() => chess.fen(), [version]) // eslint-disable-line react-hooks/exhaustive-deps
  const moves = useMemo(() => chess.history({ verbose: true }), [version]) // eslint-disable-line react-hooks/exhaustive-deps
  const turn = chess.turn()
  const myTurn = !outcome && turn === me
  const { cards, selectedId, setSelectedId, degraded } = useHand(fen, myTurn)

  const apply = useCallback((from: string, to: string, promotion?: string) => {
    const m = chess.move({ from, to, promotion })
    ;(chess.inCheck() ? sfx.check : m.captured ? sfx.capture : sfx.move)()
    setVersion(v => v + 1)
    const o = outcomeOf(chess)
    if (o) setOutcome(o)
  }, [chess])

  // Clock: ticks for the side to move once both players have moved.
  useEffect(() => {
    if (outcome || !timed) return
    const t = setInterval(() => {
      if (chess.history().length < 2) return
      const side = chess.turn()
      setClocks(c => (c ? { ...c, [side]: Math.max(0, c[side] - 250) } : c))
    }, 250)
    return () => clearInterval(t)
  }, [outcome, chess, timed])
  useEffect(() => {
    if (!outcome && clocks && (clocks.w === 0 || clocks.b === 0)) setOutcome({ result: clocks.w === 0 ? '0-1' : '1-0', termination: 'timeout' })
  }, [clocks, outcome])

  // The computer's turn.
  useEffect(() => {
    if (outcome || turn === me) return
    let live = true
    setThinking(true)
    const wait = new Promise(r => setTimeout(r, 700 + Math.random() * 600))
    Promise.all([aiMove(chess.fen(), level), wait]).then(([choice]) => {
      if (!live) return
      setThinking(false)
      if (choice.degraded) setAiDegraded(true)
      apply(choice.uci.slice(0, 2), choice.uci.slice(2, 4), choice.uci[4])
    }).catch(() => setThinking(false))
    return () => { live = false }
  }, [version, outcome]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the unfinished game so it can be resumed; drop it once it ends.
  useEffect(() => {
    if (outcome) { clearAi(user.id); return }
    if (moves.length > 0) saveAi(user.id, { level, color: me, minutes, pgn: chess.pgn(), clocks, startedAt: startedAt.current })
  }, [version, outcome]) // eslint-disable-line react-hooks/exhaustive-deps

  // Record the finished game (retrying, so a network blip doesn't lose it).
  const upload = useCallback(async (attempt = 0): Promise<void> => {
    if (!payload.current) return
    setSaveStatus('saving')
    try { const r = await api.saveGame(payload.current); setSavedId(r.id); setSaveStatus('saved') }
    catch { if (attempt < 2) setTimeout(() => void upload(attempt + 1), 1500 * (attempt + 1)); else setSaveStatus('failed') }
  }, [])
  useEffect(() => {
    if (!outcome || payload.current) return
    payload.current = { mode: `ai-${level}`, playerColor: me, result: outcome.result, termination: outcome.termination, pgn: chess.pgn(), startedAt: startedAt.current }
    void upload()
  }, [outcome]) // eslint-disable-line react-hooks/exhaustive-deps

  const play = () => {
    const c = cards?.find(x => x.id === selectedId)
    if (c && myTurn) apply(c.from, c.to, c.promotion)
  }
  const resign = () => { setConfirmResign(false); if (!outcome) setOutcome({ result: me === 'w' ? '0-1' : '1-0', termination: 'resignation' }) }

  const opp = me === 'w' ? 'b' : 'w'
  const lv = LEVELS[level]
  const players: Record<'w' | 'b', PlayerInfo> = {
    [me]: { name: user.username, color: me, clockMs: clocks?.[me] ?? null, active: !outcome && turn === me, avatar: AVATARS[me], sub: 'You' },
    [opp]: { name: `${lv.label} AI`, color: opp, clockMs: clocks?.[opp] ?? null, active: !outcome && turn === opp, avatar: AVATARS[opp], sub: thinking ? 'Thinking…' : lv.elo },
  } as Record<'w' | 'b', PlayerInfo>

  const won = outcome ? (outcome.result === '1/2-1/2' ? null : (outcome.result === '1-0') === (me === 'w')) : null
  return (
    <GameLayout
      moves={moves} orientation={me} turn={turn} inCheck={chess.inCheck()} top={players[opp]} bottom={players[me]}
      cards={cards} myTurn={myTurn} selectedId={selectedId} onSelect={setSelectedId} onPlay={play} showBest={level === 'easy'}
      notice={degraded || aiDegraded ? DEGRADED_NOTICE : undefined}
      statusTitle={outcome ? 'Game over' : myTurn ? 'YOUR TURN' : 'Opponent…'} statusSub={outcome ? outcome.termination : myTurn ? 'Choose a move card' : 'The computer is thinking'}
      onBack={onExit}
      actions={outcome ? [] : [{ label: 'Resign', testId: 'resign', onClick: () => setConfirmResign(true) }]}
      overlay={<>
        {confirmResign && <ConfirmDialog title="Resign this game?" body="The computer wins and the game is recorded." confirmLabel="Resign" onConfirm={resign} onCancel={() => setConfirmResign(false)} />}
        {outcome && (
          <GameOverModal won={won} title={won === null ? 'Draw' : won ? 'Victory!' : 'Defeat'}
            subtitle={`${cap(outcome.termination)} · ${outcome.result}`} saveStatus={saveStatus} onRetrySave={() => void upload()}
            onReview={savedId ? () => onReview(savedId) : undefined} onRematch={() => onRematch({ kind: 'ai', level, color: me === 'w' ? 'b' : 'w', minutes })} onLobby={onExit} />
        )}
      </>}
    />
  )
}

// ───────────────────────── Friend game ─────────────────────────
interface RoomState {
  code: string; status: 'waiting' | 'playing' | 'over'; fen: string; turn: 'w' | 'b'; pgn: string; inCheck: boolean
  white: { username: string; online: boolean } | null; black: { username: string; online: boolean } | null
  clocks: { w: number; b: number } | null; color: 'w' | 'b' | null; result: string | null; termination: string | null
  drawOffer: 'w' | 'b' | null; gameId: number | null
}

function PvpGame({ setup, onExit, onReview }: Props & { setup: Exclude<GameSetup, { kind: 'ai' }> }) {
  const [room, setRoom] = useState<RoomState | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [connected, setConnected] = useState(true)
  const [now, setNow] = useState(Date.now())
  const [confirm, setConfirm] = useState<'resign' | 'close' | null>(null)
  const receivedAt = useRef(Date.now())
  const codeRef = useRef<string | null>(setup.kind === 'join' ? setup.code : null)
  const lastSan = useRef(0)
  const errTimer = useRef<ReturnType<typeof setTimeout>>()
  /** Short-lived message (move errors); join/connect errors stay until resolved. */
  const flash = (msg: string) => { setError(msg); clearTimeout(errTimer.current); errTimer.current = setTimeout(() => setError(''), 4000) }

  useEffect(() => {
    const s = getSocket()
    const onState = (r: RoomState) => { receivedAt.current = Date.now(); setRoom(r) }
    const join = () => s.emit('room:join', { code: codeRef.current }, (res: { error?: string }) => res?.error && setError(res.error))
    s.on('room:state', onState)
    s.on('disconnect', () => setConnected(false))
    s.on('connect_error', e => setError(e.message === 'unauthorized' ? 'Please sign in again.' : 'Connection lost. Retrying…'))
    s.on('connect', () => { setError(''); setConnected(true); if (codeRef.current) join() })
    setConnected(s.connected)
    const start = () => {
      if (setup.kind === 'create') s.emit('room:create', { minutes: setup.minutes, color: setup.color }, (res: { code?: string; error?: string }) => { if (res.error) setError(res.error); else codeRef.current = res.code! })
      else join()
    }
    if (s.connected) start(); else s.once('connect', start)
    return () => { clearTimeout(errTimer.current); s.off('room:state', onState); s.off('connect_error'); s.off('connect'); s.off('disconnect'); s.emit('game:leave') }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t) }, [])

  const moves = useMemo(() => movesFromPgn(room?.pgn ?? ''), [room?.pgn])
  useEffect(() => {
    if (moves.length > lastSan.current) { const m = moves[moves.length - 1]; (m.san.includes('+') || m.san.includes('#') ? sfx.check : m.captured ? sfx.capture : sfx.move)() }
    lastSan.current = moves.length
  }, [moves])

  const me = room?.color ?? (setup.kind === 'create' && setup.color !== 'random' ? setup.color : 'w')
  const playing = room?.status === 'playing'
  const myTurn = !!room && playing && room.turn === me
  const { cards, selectedId, setSelectedId, degraded } = useHand(room?.fen ?? '', myTurn)

  const clockFor = (c: 'w' | 'b') => {
    if (!room || !room.clocks) return null
    const base = room.clocks[c]
    return playing && room.turn === c && moves.length >= 2 ? Math.max(0, base - (now - receivedAt.current)) : base
  }
  const opp = me === 'w' ? 'b' : 'w'
  const nameOf = (c: 'w' | 'b') => (c === 'w' ? room?.white : room?.black)
  const mk = (c: 'w' | 'b'): PlayerInfo => ({
    name: nameOf(c)?.username ?? 'Waiting…', color: c, clockMs: clockFor(c), active: !!playing && room!.turn === c,
    online: nameOf(c) ? nameOf(c)!.online : undefined, avatar: AVATARS[c], sub: c === me ? 'You' : 'Friend',
  })

  const play = () => {
    const c = cards?.find(x => x.id === selectedId)
    if (!c || !myTurn) return
    getSocket().emit('move:play', { from: c.from, to: c.to, promotion: c.promotion }, (res: { error?: string }) => res?.error && flash(res.error))
    setSelectedId(null)
  }
  const copy = async () => { try { await navigator.clipboard.writeText(room!.code) } catch { /* ignore */ } setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const share = async () => {
    const url = `${location.origin}/?room=${room!.code}`
    if (navigator.share) { try { await navigator.share({ title: "Knight's Hand", text: `Join my chess game! Code: ${room!.code}`, url }) } catch { /* cancelled */ } } else copy()
  }
  // Leaving a waiting room closes it (so ask first); leaving a running game keeps your seat and you can resume from the lobby.
  const back = () => { if (room?.status === 'waiting') setConfirm('close'); else onExit() }

  if (!room) return (
    <div className="min-h-[100dvh] table-bg flex flex-col items-center justify-center gap-4 p-6 text-center">
      {error ? <><p role="alert" className="text-red-300 text-lg">{error}</p><button className="btn-gold" onClick={onExit}>Back to lobby</button></>
        : <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }} className="text-5xl">♞</motion.div>}
    </div>
  )

  const over = room.status === 'over'
  const won = over && room.result ? (room.result === '1/2-1/2' ? null : (room.result === '1-0') === (me === 'w')) : null
  const drawOfferedToMe = room.drawOffer && room.drawOffer !== me
  const statusTitle = room.status === 'waiting' ? 'Waiting' : over ? 'Game over' : myTurn ? 'YOUR TURN' : 'Opponent…'
  const statusSub = room.status === 'waiting' ? 'Share your code' : over ? room.termination ?? '' : myTurn ? 'Choose a move card' : `${nameOf(opp)?.username ?? 'Friend'} is choosing`

  return (
    <GameLayout
      moves={moves} orientation={me} turn={room.turn} inCheck={room.inCheck} top={mk(opp)} bottom={mk(me)}
      cards={cards} myTurn={myTurn} selectedId={selectedId} onSelect={setSelectedId} onPlay={play} showBest={false}
      notice={degraded ? DEGRADED_NOTICE : undefined}
      statusTitle={statusTitle} statusSub={statusSub} onBack={back}
      actions={playing ? [
        { label: room.drawOffer === me ? 'Draw offered' : 'Offer draw', testId: 'offer-draw', disabled: room.drawOffer === me, onClick: () => getSocket().emit('game:offerDraw') },
        { label: 'Resign', testId: 'resign', onClick: () => setConfirm('resign') },
      ] : []}
      boardOverlay={<>
        {room.status === 'waiting' && (
          <motion.div className="absolute inset-0 z-10 flex items-center justify-center p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="panel w-full max-w-xs p-5 text-center bg-black/80">
              <div className="font-display text-sm tracking-widest text-parch-200">ROOM CODE</div>
              <div className="font-display font-black text-4xl sm:text-5xl tracking-[.25em] gold-text my-2" data-testid="room-code">{room.code}</div>
              <p className="text-parch-200 text-sm mb-3">Your friend enters this code in "Join a friend". You play {me === 'w' ? 'White' : 'Black'}.</p>
              <div className="flex gap-2 justify-center"><button className="btn-gold !py-2 !px-4" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button><button className="btn-ghost" onClick={share}>Share</button></div>
              <motion.div className="mt-3 text-parch-300 text-sm" animate={{ opacity: [.4, 1, .4] }} transition={{ repeat: Infinity, duration: 1.6 }}>Waiting for your friend…</motion.div>
            </div>
          </motion.div>
        )}
        {drawOfferedToMe && !over && (
          <div className="absolute inset-x-0 top-2 z-10 flex justify-center"><div className="panel px-4 py-2 flex gap-2 items-center bg-black/80"><span className="text-sm">Draw offered</span>
            <button className="btn-gold !py-1 !px-3 !min-h-[34px] !text-xs" onClick={() => getSocket().emit('game:offerDraw')}>Accept</button>
            <button className="btn-ghost !min-h-[34px]" onClick={() => getSocket().emit('game:declineDraw')}>Decline</button></div></div>
        )}
        {!connected && <div role="status" className="absolute top-2 inset-x-2 z-10 text-center text-sm text-amber-100 bg-amber-900/90 rounded-lg py-1">Connection lost. Reconnecting…</div>}
        {error && <div role="alert" className="absolute bottom-2 inset-x-2 z-10 text-center text-sm text-red-200 bg-red-950/90 rounded-lg py-1">{error}</div>}
      </>}
      overlay={<>
        {confirm === 'resign' && <ConfirmDialog title="Resign this game?" body="Your friend wins and the game is recorded." confirmLabel="Resign" onConfirm={() => { setConfirm(null); getSocket().emit('game:resign') }} onCancel={() => setConfirm(null)} />}
        {confirm === 'close' && <ConfirmDialog title="Close this room?" body="Your friend won't be able to join with the code any more." confirmLabel="Close room" cancelLabel="Keep waiting" onConfirm={() => { setConfirm(null); onExit() }} onCancel={() => setConfirm(null)} />}
        {over && (
          <GameOverModal won={won} title={won === null ? 'Draw' : won ? 'Victory!' : 'Defeat'}
            subtitle={`${cap(room.termination ?? '')} · ${room.result}`}
            onReview={room.gameId ? () => onReview(room.gameId!) : undefined} onLobby={onExit} />
        )}
      </>}
    />
  )
}
