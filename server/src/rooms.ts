import type { Server, Socket } from 'socket.io'
import { Chess } from 'chess.js'
import { z } from 'zod'
import { COOKIE, verifyToken, type AuthUser } from './auth.js'
import { saveGame, type Db } from './db.js'
import { parse } from 'cookie'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

interface Seat { user: AuthUser; socketId: string | null }
interface Room {
  code: string
  chess: Chess
  white: Seat | null
  black: Seat | null
  hostColor: 'w' | 'b'
  clocks: { w: number; b: number }
  increment: number
  lastTick: number
  status: 'waiting' | 'playing' | 'over'
  result?: string
  termination?: string
  drawOffer?: 'w' | 'b'
  startedAt: number
  gameId?: number
  timer?: NodeJS.Timeout
}

const createSchema = z.object({
  minutes: z.number().min(1).max(60).default(10),
  increment: z.number().min(0).max(30).default(0),
  color: z.enum(['w', 'b', 'random']).default('random'),
})
const moveSchema = z.object({ from: z.string().regex(/^[a-h][1-8]$/), to: z.string().regex(/^[a-h][1-8]$/), promotion: z.enum(['q', 'r', 'b', 'n']).optional() })

export function attachRooms(io: Server, db: Db) {
  const rooms = new Map<string, Room>()

  io.use((socket, next) => {
    const cookies = parse(socket.handshake.headers.cookie || '')
    const user = verifyToken(cookies[COOKIE])
    if (!user) return next(new Error('unauthorized'))
    socket.data.user = user
    next()
  })

  const seatOf = (room: Room, userId: number): 'w' | 'b' | null =>
    room.white?.user.id === userId ? 'w' : room.black?.user.id === userId ? 'b' : null

  function view(room: Room, color: 'w' | 'b' | null) {
    return {
      code: room.code,
      status: room.status,
      fen: room.chess.fen(),
      turn: room.chess.turn(),
      history: room.chess.history(),
      pgn: room.chess.pgn(),
      white: room.white ? { username: room.white.user.username, online: !!room.white.socketId } : null,
      black: room.black ? { username: room.black.user.username, online: !!room.black.socketId } : null,
      clocks: liveClocks(room),
      color,
      result: room.result ?? null,
      termination: room.termination ?? null,
      drawOffer: room.drawOffer ?? null,
      gameId: room.gameId ?? null,
      inCheck: room.chess.inCheck(),
    }
  }

  function liveClocks(room: Room) {
    const c = { ...room.clocks }
    if (room.status === 'playing' && room.chess.history().length >= 2) c[room.chess.turn()] = Math.max(0, c[room.chess.turn()] - (Date.now() - room.lastTick))
    return c
  }

  function broadcast(room: Room) {
    for (const seat of [room.white, room.black]) {
      if (!seat?.socketId) continue
      io.to(seat.socketId).emit('room:state', view(room, seatOf(room, seat.user.id)))
    }
  }

  function finish(room: Room, result: string, termination: string) {
    if (room.status === 'over') return
    room.status = 'over'
    room.result = result
    room.termination = termination
    if (room.timer) clearInterval(room.timer)
    room.gameId = saveGame(db, {
      whiteId: room.white!.user.id, blackId: room.black!.user.id,
      whiteLabel: room.white!.user.username, blackLabel: room.black!.user.username,
      mode: 'pvp', result, termination, pgn: room.chess.pgn(), startedAt: room.startedAt, endedAt: Date.now(),
    })
    broadcast(room)
    setTimeout(() => rooms.delete(room.code), 10 * 60_000).unref()
  }

  function startClock(room: Room) {
    room.lastTick = Date.now()
    room.timer = setInterval(() => {
      if (room.status !== 'playing') return
      // Clock only runs once both sides have moved.
      if (room.chess.history().length < 2) { room.lastTick = Date.now(); return }
      const turn = room.chess.turn()
      const left = room.clocks[turn] - (Date.now() - room.lastTick)
      if (left <= 0) {
        room.clocks[turn] = 0
        finish(room, turn === 'w' ? '0-1' : '1-0', 'timeout')
      } else broadcast(room)
    }, 1000)
  }

  function makeCode() {
    for (;;) {
      const code = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
      if (!rooms.has(code)) return code
    }
  }

  io.on('connection', (socket: Socket) => {
    const user: AuthUser = socket.data.user
    let current: Room | null = null

    const attach = (room: Room, color: 'w' | 'b') => {
      const seat = color === 'w' ? room.white! : room.black!
      seat.socketId = socket.id
      current = room
      socket.join(room.code)
    }

    socket.on('room:create', (raw, ack) => {
      const p = createSchema.safeParse(raw ?? {})
      if (!p.success) return ack?.({ error: 'Invalid settings' })
      const color = p.data.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : p.data.color
      const room: Room = {
        code: makeCode(), chess: new Chess(), white: null, black: null, hostColor: color,
        clocks: { w: p.data.minutes * 60_000, b: p.data.minutes * 60_000 }, increment: p.data.increment * 1000,
        lastTick: Date.now(), status: 'waiting', startedAt: Date.now(),
      }
      const seat = { user, socketId: null }
      if (color === 'w') room.white = seat; else room.black = seat
      rooms.set(room.code, room)
      attach(room, color)
      ack?.({ code: room.code })
      broadcast(room)
    })

    socket.on('room:join', (raw, ack) => {
      const code = String(raw?.code ?? '').toUpperCase().trim()
      const room = rooms.get(code)
      if (!room) return ack?.({ error: 'Room not found. Check the code.' })
      const mine = seatOf(room, user.id)
      if (mine) { attach(room, mine); ack?.({ code }); return broadcast(room) } // reconnect
      if (room.white && room.black) return ack?.({ error: 'Room is full' })
      const color = room.white ? 'b' : 'w'
      const seat = { user, socketId: null }
      if (color === 'w') room.white = seat; else room.black = seat
      attach(room, color)
      room.status = 'playing'
      room.startedAt = Date.now()
      startClock(room)
      ack?.({ code })
      broadcast(room)
    })

    socket.on('move:play', (raw, ack) => {
      const room = current
      if (!room || room.status !== 'playing') return ack?.({ error: 'No active game' })
      const color = seatOf(room, user.id)
      if (!color || room.chess.turn() !== color) return ack?.({ error: 'Not your turn' })
      const p = moveSchema.safeParse(raw)
      if (!p.success) return ack?.({ error: 'Bad move' })
      const now = Date.now()
      try { room.chess.move(p.data) } catch { return ack?.({ error: 'Illegal move' }) }
      if (room.chess.history().length > 2) {
        room.clocks[color] = Math.max(0, room.clocks[color] - (now - room.lastTick)) + room.increment
      }
      room.lastTick = now
      room.drawOffer = undefined
      ack?.({ ok: true })
      const c = room.chess
      if (c.isCheckmate()) return finish(room, color === 'w' ? '1-0' : '0-1', 'checkmate')
      if (c.isStalemate()) return finish(room, '1/2-1/2', 'stalemate')
      if (c.isInsufficientMaterial()) return finish(room, '1/2-1/2', 'insufficient material')
      if (c.isThreefoldRepetition()) return finish(room, '1/2-1/2', 'repetition')
      if (c.isDraw()) return finish(room, '1/2-1/2', 'fifty-move rule')
      broadcast(room)
    })

    socket.on('game:resign', () => {
      const room = current
      if (!room || room.status !== 'playing') return
      const color = seatOf(room, user.id)
      if (color) finish(room, color === 'w' ? '0-1' : '1-0', 'resignation')
    })

    socket.on('game:offerDraw', () => {
      const room = current
      if (!room || room.status !== 'playing') return
      const color = seatOf(room, user.id)
      if (!color) return
      if (room.drawOffer && room.drawOffer !== color) return finish(room, '1/2-1/2', 'agreement')
      room.drawOffer = color
      broadcast(room)
    })

    socket.on('game:declineDraw', () => {
      if (current?.drawOffer) { current.drawOffer = undefined; broadcast(current) }
    })

    socket.on('game:leave', () => {
      const room = current
      if (!room) return
      socket.leave(room.code)
      const color = seatOf(room, user.id)
      const seat = color === 'w' ? room.white : color === 'b' ? room.black : null
      if (seat?.socketId === socket.id) seat.socketId = null
      if (room.status === 'waiting') rooms.delete(room.code)
      else if (room.status === 'playing') broadcast(room)
      current = null
    })

    socket.on('disconnect', () => {
      const room = current
      if (!room) return
      const color = seatOf(room, user.id)
      const seat = color === 'w' ? room.white : color === 'b' ? room.black : null
      if (seat && seat.socketId === socket.id) { seat.socketId = null; broadcast(room) }
      // Abandoned waiting rooms are cleaned up.
      if (room.status === 'waiting' && !room.white?.socketId && !room.black?.socketId) {
        rooms.delete(room.code)
      }
    })
  })
}
