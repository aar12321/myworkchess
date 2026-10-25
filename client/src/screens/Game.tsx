import { motion } from 'framer-motion'
import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type User } from '../api'
import { GameLayout } from '../components/GameLayout'
import { GameOverModal } from '../components/GameOverModal'
import type { PlayerInfo } from '../components/PlayerBar'
import { aiMove, LEVELS, type Level } from '../engine/ai'
import { dealHand, type Card } from '../engine/hand'
import { sfx } from '../sfx'
import { getSocket } from '../socket'
import { movesFromPgn } from '../tracker'
import type { GameSetup } from './Lobby'

interface Props { user: User; setup: GameSetup; onExit: () => void; onReview: (id: number) => void; onRematch: (s: GameSetup) => void }

const AI_MINUTES = 10
interface Outcome { result: '1-0' | '0-1' | '1/2-1/2'; termination: string }

const AVATARS = { w: '/assets/avatar-w.webp', b: '/assets/avatar-b.webp' }

/** Shared selection + dealing logic: deals a fresh hand whenever it becomes my turn on a new position. */
function useHand(fen: string, myTurn: boolean, depth = 9) {
  const [cards, setCards] = useState<Card[] | null>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => {
    setSelectedId(null)
    if (!myTurn) { setCards([]); return }
    let live = true
    setCards(null)
    dealHand(fen, depth).then(h => { if (live) { setCards(h); sfx.deal() } }).catch(() => { if (live) setCards([]) })
    return () => { live = false }
  }, [fen, myTurn, depth])
  return { cards, selectedId, setSelectedId }
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

// ───────────────────────── AI game ─────────────────────────
function AiGame({ user, setup, onExit, onReview, onRematch }: Props & { setup: Extract<GameSetup, { kind: 'ai' }> }) {
  const me = setup.color
  const chessRef = useRef(new Chess())
  const startedAt = useRef(Date.now())
  const [version, setVersion] = useState(0)
  const [clocks, setClocks] = useState({ w: AI_MINUTES * 60_000, b: AI_MINUTES * 60_000 })
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [savedId, setSavedId] = useState<number | null>(null)
  const [thinking, setThinking] = useState(false)
  const savedRef = useRef(false)

  const chess = chessRef.current
  const fen = useMemo(() => chess.fen(), [version]) // eslint-disable-line react-hooks/exhaustive-deps
  const moves = useMemo(() => chess.history({ verbose: true }), [version]) // eslint-disable-line react-hooks/exhaustive-deps
  const turn = chess.turn()
  const myTurn = !outcome && turn === me
  const { cards, selectedId, setSelectedId } = useHand(fen, myTurn)

  const apply = useCallback((from: string, to: string, promotion?: string) => {
    const m = chess.move({ from, to, promotion })
    ;(chess.inCheck() ? sfx.check : m.captured ? sfx.capture : sfx.move)()
    setVersion(v => v + 1)
    const o = outcomeOf(chess)
    if (o) setOutcome(o)
  }, [chess])

  // Clock: ticks for the side to move once both players have moved.
  useEffect(() => {
    if (outcome) return
    const t = setInterval(() => {
      if (chess.history().length < 2) return
      const side = chess.turn()
      setClocks(c => {
        const left = Math.max(0, c[side] - 250)
        if (left === 0) setOutcome({ result: side === 'w' ? '0-1' : '1-0', termination: 'timeout' })
        return { ...c, [side]: left }
      })
    }, 250)
    return () => clearInterval(t)
  }, [outcome, chess])

  // The computer's turn.
  useEffect(() => {
    if (outcome || turn === me) return
    let live = true
    setThinking(true)
    const wait = new Promise(r => setTimeout(r, 700 + Math.random() * 600))
    Promise.all([aiMove(chess.fen(), setup.level), wait]).then(([uci]) => {
      if (!live) return
      setThinking(false)
      apply(uci.slice(0, 2), uci.slice(2, 4), uci[4])
    }).catch(() => setThinking(false))
    return () => { live = false }
  }, [version, outcome]) // eslint-disable-line react-hooks/exhaustive-deps

  // Record the finished game.
  useEffect(() => {
    if (!outcome || savedRef.current) return
    savedRef.current = true
    api.saveGame({ mode: `ai-${setup.level}`, playerColor: me, result: outcome.result, termination: outcome.termination, pgn: chess.pgn(), startedAt: startedAt.current })
      .then(r => setSavedId(r.id)).catch(() => undefined)
  }, [outcome]) // eslint-disable-line react-hooks/exhaustive-deps

  const play = () => {
    const c = cards?.find(x => x.id === selectedId)
    if (c && myTurn) apply(c.from, c.to, c.promotion)
  }
  const resign = () => { if (!outcome && window.confirm('Resign this game?')) setOutcome({ result: me === 'w' ? '0-1' : '1-0', termination: 'resignation' }) }

  const opp = me === 'w' ? 'b' : 'w'
  const lv = LEVELS[setup.level]
  const players: Record<'w' | 'b', PlayerInfo> = {
    [me]: { name: user.username, color: me, clockMs: clocks[me], active: !outcome && turn === me, avatar: AVATARS[me], sub: 'You' },
    [opp]: { name: `${lv.label} AI`, color: opp, clockMs: clocks[opp], active: !outcome && turn === opp, avatar: AVATARS[opp], sub: thinking ? 'Thinking…' : lv.elo },
  } as Record<'w' | 'b', PlayerInfo>

  const won = outcome ? (outcome.result === '1/2-1/2' ? null : (outcome.result === '1-0') === (me === 'w')) : null
  return (
    <GameLayout
      moves={moves} orientation={me} turn={turn} inCheck={chess.inCheck()} top={players[opp]} bottom={players[me]}
      cards={cards} myTurn={myTurn} selectedId={selectedId} onSelect={setSelectedId} onPlay={play} showBest={setup.level === 'easy'}
      statusTitle={outcome ? 'Game over' : myTurn ? 'YOUR TURN' : 'Opponent…'} statusSub={outcome ? outcome.termination : myTurn ? 'Choose a move card' : 'The computer is thinking'}
      onBack={onExit}
      menu={!outcome && <button className="btn-ghost" onClick={resign} data-testid="resign">Resign</button>}
      overlay={outcome && (
        <GameOverModal won={won} title={won === null ? 'Draw' : won ? 'Victory!' : 'Defeat'}
          subtitle={`${outcome.termination[0].toUpperCase()}${outcome.termination.slice(1)} · ${outcome.result}`}
          onReview={savedId ? () => onReview(savedId) : undefined} onRematch={() => onRematch({ ...setup, color: me === 'w' ? 'b' : 'w' })} onLobby={onExit} />
      )}
    />
  )
}

// ───────────────────────── Friend game ─────────────────────────
interface RoomState {
  code: string; status: 'waiting' | 'playing' | 'over'; fen: string; turn: 'w' | 'b'; pgn: string; inCheck: boolean
  white: { username: string; online: boolean } | null; black: { username: string; online: boolean } | null
  clocks: { w: number; b: number }; color: 'w' | 'b' | null; result: string | null; termination: string | null
  drawOffer: 'w' | 'b' | null; gameId: number | null
}

function PvpGame({ user, setup, onExit, onReview }: Props & { setup: Exclude<GameSetup, { kind: 'ai' }> }) {
  const [room, setRoom] = useState<RoomState | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(Date.now())
  const receivedAt = useRef(Date.now())
  const codeRef = useRef<string | null>(setup.kind === 'join' ? setup.code : null)
  const lastSan = useRef(0)

  useEffect(() => {
    const s = getSocket()
    const onState = (r: RoomState) => { receivedAt.current = Date.now(); setRoom(r) }
    const join = () => s.emit('room:join', { code: codeRef.current }, (res: { error?: string }) => res?.error && setError(res.error))
    s.on('room:state', onState)
    s.on('connect_error', e => setError(e.message === 'unauthorized' ? 'Please sign in again.' : 'Connection lost. Retrying…'))
    s.on('connect', () => { setError(''); if (codeRef.current) join() })
    const start = () => {
      if (setup.kind === 'create') s.emit('room:create', { minutes: setup.minutes, color: setup.color }, (res: { code?: string; error?: string }) => { if (res.error) setError(res.error); else codeRef.current = res.code! })
      else join()
    }
    if (s.connected) start(); else s.once('connect', start)
    return () => { s.off('room:state', onState); s.off('connect_error'); s.off('connect'); s.emit('game:leave') }
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
  const { cards, selectedId, setSelectedId } = useHand(room?.fen ?? '', myTurn)

  const clockFor = (c: 'w' | 'b') => {
    if (!room) return null
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
    getSocket().emit('move:play', { from: c.from, to: c.to, promotion: c.promotion }, (res: { error?: string }) => res?.error && setError(res.error))
    setSelectedId(null)
  }
  const copy = async () => { try { await navigator.clipboard.writeText(room!.code) } catch { /* ignore */ } setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const share = async () => {
    const url = `${location.origin}/?room=${room!.code}`
    if (navigator.share) { try { await navigator.share({ title: "Knight's Hand", text: `Join my chess game! Code: ${room!.code}`, url }) } catch { /* cancelled */ } } else copy()
  }

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
      statusTitle={statusTitle} statusSub={statusSub} onBack={onExit}
      menu={playing && (
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => getSocket().emit('game:offerDraw')} disabled={room.drawOffer === me}>{room.drawOffer === me ? 'Draw offered' : 'Draw'}</button>
          <button className="btn-ghost" data-testid="resign" onClick={() => window.confirm('Resign this game?') && getSocket().emit('game:resign')}>Resign</button>
        </div>
      )}
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
        {error && <div role="alert" className="absolute bottom-2 inset-x-2 z-10 text-center text-sm text-red-200 bg-red-950/90 rounded-lg py-1">{error}</div>}
      </>}
      overlay={over && (
        <GameOverModal won={won} title={won === null ? 'Draw' : won ? 'Victory!' : 'Defeat'}
          subtitle={`${(room.termination ?? '')[0]?.toUpperCase() ?? ''}${(room.termination ?? '').slice(1)} · ${room.result}`}
          onReview={room.gameId ? () => onReview(room.gameId!) : undefined} onLobby={onExit} />
      )}
    />
  )
}
