import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { io as ioc, type Socket } from 'socket.io-client'
import type { AddressInfo } from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../src/app.js'
import { openDb } from '../src/db.js'

process.env.ABANDON_MS = '400' // abandoned-room test must not wait 10 minutes
const { app, server } = createApp(openDb(':memory:'))
let url = ''
beforeAll(async () => { await new Promise<void>(r => server.listen(0, r)); url = `http://localhost:${(server.address() as AddressInfo).port}` })
afterAll(() => { server.close() })

const cookieOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[]).map(c => c.split(';')[0]).join('; ')

describe('auth', () => {
  it('logs in the seeded demo account (demo / 1234)', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'demo', password: '1234' })
    expect(res.status).toBe(200)
    expect(res.body.user.username).toBe('demo')
    const me = await request(app).get('/api/auth/me').set('Cookie', cookieOf(res))
    expect(me.body.user.username).toBe('demo')
  })
  it('rejects a wrong password and unknown user', async () => {
    expect((await request(app).post('/api/auth/login').send({ username: 'demo', password: 'nope1' })).status).toBe(401)
    expect((await request(app).post('/api/auth/login').send({ username: 'ghost', password: '1234' })).status).toBe(401)
  })
  it('registers a new user, then logs in; duplicates (any case) are rejected', async () => {
    const reg = await request(app).post('/api/auth/register').send({ username: 'alice_1', password: 'secret' })
    expect(reg.status).toBe(201)
    expect((await request(app).post('/api/auth/register').send({ username: 'ALICE_1', password: 'other' })).status).toBe(409)
    expect((await request(app).post('/api/auth/login').send({ username: 'alice_1', password: 'secret' })).status).toBe(200)
  })
  it('validates username and password', async () => {
    expect((await request(app).post('/api/auth/register').send({ username: 'a', password: 'secret' })).status).toBe(400)
    expect((await request(app).post('/api/auth/register').send({ username: 'bad name!', password: 'secret' })).status).toBe(400)
    expect((await request(app).post('/api/auth/register').send({ username: 'okname', password: '123' })).status).toBe(400)
  })
  it('requires auth for games and logout clears session', async () => {
    expect((await request(app).get('/api/games')).status).toBe(401)
    const res = await request(app).post('/api/auth/login').send({ username: 'demo', password: '1234' })
    const out = await request(app).post('/api/auth/logout').set('Cookie', cookieOf(res))
    expect(out.status).toBe(200)
  })
})

describe('games', () => {
  it('saves an AI game and lists/loads it only for its owner', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'demo', password: '1234' })
    const ck = cookieOf(res)
    const save = await request(app).post('/api/games').set('Cookie', ck).send({
      mode: 'ai-easy', playerColor: 'w', result: '0-1', termination: 'checkmate', startedAt: Date.now() - 1000,
      pgn: '1. f3 e5 2. g4 Qh4#',
    })
    expect(save.status).toBe(201)
    const list = await request(app).get('/api/games').set('Cookie', ck)
    expect(list.body.games.length).toBe(1)
    expect((await request(app).get(`/api/games/${save.body.id}`).set('Cookie', ck)).body.game.pgn).toContain('Qh4#')
    const other = await request(app).post('/api/auth/register').send({ username: 'bobby', password: 'secret' })
    expect((await request(app).get(`/api/games/${save.body.id}`).set('Cookie', cookieOf(other))).status).toBe(404)
  })
  it('rejects an invalid PGN', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'demo', password: '1234' })
    const bad = await request(app).post('/api/games').set('Cookie', cookieOf(res)).send({
      mode: 'ai-hard', playerColor: 'b', result: '1-0', termination: 'resignation', startedAt: 1, pgn: '1. e5 e4 2. zz',
    })
    expect(bad.status).toBe(400)
  })
})

describe('multiplayer rooms', () => {
  const connect = async (username: string, password: string) => {
    let res = await request(app).post('/api/auth/login').send({ username, password })
    if (res.status !== 200) res = await request(app).post('/api/auth/register').send({ username, password })
    return ioc(url, { extraHeaders: { cookie: cookieOf(res) }, forceNew: true })
  }
  const once = <T,>(s: Socket, ev: string, pred: (d: any) => boolean = () => true) =>
    new Promise<T>(r => { const h = (d: any) => { if (pred(d)) { s.off(ev, h); r(d) } }; s.on(ev, h) })
  const emit = <T,>(s: Socket, ev: string, data?: unknown) => new Promise<T>(r => s.emit(ev, data, r))

  it('plays fool\'s mate through a room code and records the game', async () => {
    const a = await connect('demo', '1234')
    const b = await connect('friend1', 'secret')
    const created = await emit<{ code: string }>(a, 'room.create'.replace('.', ':'), { color: 'w', minutes: 5 })
    expect(created.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect((await emit<{ error: string }>(b, 'room:join', { code: 'ZZZZZZ' })).error).toBeTruthy()
    const playing = once<any>(a, 'room:state', d => d.status === 'playing')
    await emit(b, 'room:join', { code: created.code.toLowerCase() })
    expect((await playing).black.username).toBe('friend1')

    expect((await emit<any>(b, 'move:play', { from: 'e7', to: 'e5' })).error).toBe('Not your turn')
    expect((await emit<any>(a, 'move:play', { from: 'e2', to: 'e5' })).error).toBe('Illegal move')
    const over = once<any>(b, 'room:state', d => d.status === 'over')
    expect((await emit<any>(a, 'move:play', { from: 'f2', to: 'f3' })).ok).toBe(true)
    await emit(b, 'move:play', { from: 'e7', to: 'e5' })
    await emit(a, 'move:play', { from: 'g2', to: 'g4' })
    await emit(b, 'move:play', { from: 'd8', to: 'h4' })
    const end = await over
    expect(end.result).toBe('0-1')
    expect(end.termination).toBe('checkmate')
    expect(end.gameId).toBeGreaterThan(0)
    a.close(); b.close()
  })

  it('handles resignation and saves it for both players', async () => {
    const a = await connect('demo', '1234')
    const b = await connect('friend1', 'secret')
    const { code } = await emit<{ code: string }>(a, 'room:create', { color: 'b' })
    await emit(b, 'room:join', { code })
    const over = once<any>(a, 'room:state', d => d.status === 'over')
    b.emit('game:resign')
    const end = await over
    expect(end.result).toBe('0-1') // host is black, white (friend1) resigned
    expect(end.termination).toBe('resignation')
    a.close(); b.close()
  })
})

describe('room resilience and untimed games', () => {
  const connect = async (username: string, password: string) => {
    let res = await request(app).post('/api/auth/login').send({ username, password })
    if (res.status !== 200) res = await request(app).post('/api/auth/register').send({ username, password })
    const cookie = cookieOf(res)
    return { cookie, socket: ioc(url, { extraHeaders: { cookie }, forceNew: true }) }
  }
  const once = <T,>(s: Socket, ev: string, pred: (d: any) => boolean = () => true) =>
    new Promise<T>(r => { const h = (d: any) => { if (pred(d)) { s.off(ev, h); r(d) } }; s.on(ev, h) })
  const emit = <T,>(s: Socket, ev: string, data?: unknown) => new Promise<T>(r => s.emit(ev, data, r))
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  it('a waiting room survives the host disconnecting, and the host can resume it', async () => {
    const host = await connect('demo', '1234')
    const friend = await connect('friend2', 'secret')
    const { code } = await emit<{ code: string }>(host.socket, 'room:create', { color: 'w' })
    host.socket.close() // phone backgrounded / page reloaded
    await sleep(150)

    const active = await request(app).get('/api/rooms/active').set('Cookie', host.cookie)
    expect(active.body.room).toEqual({ code, status: 'waiting' })

    const joined = await emit<{ code?: string; error?: string }>(friend.socket, 'room:join', { code })
    expect(joined.error).toBeUndefined()

    // Host comes back on a fresh socket and is seated again, playing.
    const host2 = ioc(url, { extraHeaders: { cookie: host.cookie }, forceNew: true })
    const state = once<any>(host2, 'room:state', d => d.status === 'playing')
    await emit(host2, 'room:join', { code })
    const s = await state
    expect(s.color).toBe('w')
    expect(s.black.username).toBe('friend2')
    // Finish so the room doesn't linger for other tests.
    host2.emit('game:resign')
    await sleep(100)
    host2.close(); friend.socket.close()
  })

  it('rejects joining your own waiting room from a second tab', async () => {
    const a = await connect('demo', '1234')
    const { code } = await emit<{ code: string }>(a.socket, 'room:create', { color: 'w' })
    const second = ioc(url, { extraHeaders: { cookie: a.cookie }, forceNew: true })
    const res = await emit<{ error?: string }>(second, 'room:join', { code })
    expect(res.error).toMatch(/your own room/i)
    a.socket.emit('game:leave') // the host walking away on purpose deletes the room
    await sleep(100)
    const gone = await emit<{ error?: string }>(second, 'room:join', { code })
    expect(gone.error).toMatch(/not found/i)
    a.socket.close(); second.close()
  })

  it('untimed rooms have no clocks and play normally', async () => {
    const a = await connect('demo', '1234')
    const b = await connect('friend3', 'secret')
    const { code } = await emit<{ code: string }>(a.socket, 'room:create', { color: 'w', minutes: 0 })
    const playing = once<any>(a.socket, 'room:state', d => d.status === 'playing')
    await emit(b.socket, 'room:join', { code })
    expect((await playing).clocks).toBeNull()
    const next = once<any>(b.socket, 'room:state', d => d.history.length === 1)
    expect((await emit<any>(a.socket, 'move:play', { from: 'e2', to: 'e4' })).ok).toBe(true)
    expect((await next).clocks).toBeNull()
    await sleep(1300) // the 1s clock tick must not time anyone out or crash
    const over = once<any>(a.socket, 'room:state', d => d.status === 'over')
    b.socket.emit('game:resign')
    expect((await over).termination).toBe('resignation')
    a.socket.close(); b.socket.close()
  })
})

describe('hardening and game flow', () => {
  const connect = async (username: string, password: string) => {
    let res = await request(app).post('/api/auth/login').send({ username, password })
    if (res.status !== 200) res = await request(app).post('/api/auth/register').send({ username, password })
    const cookie = cookieOf(res)
    return { cookie, socket: ioc(url, { extraHeaders: { cookie }, forceNew: true }) }
  }
  const once = <T,>(s: Socket, ev: string, pred: (d: any) => boolean = () => true) =>
    new Promise<T>(r => { const h = (d: any) => { if (pred(d)) { s.off(ev, h); r(d) } }; s.on(ev, h) })
  const emit = <T,>(s: Socket, ev: string, data?: unknown) => new Promise<T>(r => s.emit(ev, data, r))
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
  const startGame = async (a: Awaited<ReturnType<typeof connect>>, b: Awaited<ReturnType<typeof connect>>, opts: object = { color: 'w' }) => {
    const { code } = await emit<{ code: string }>(a.socket, 'room:create', opts)
    await emit(b.socket, 'room:join', { code })
    return code
  }

  it('survives a client sending a non-function ack or junk payloads', async () => {
    const a = await connect('demo', '1234')
    a.socket.emit('room:create', {}, 'not-a-function')
    a.socket.emit('room:join', null, 42)
    a.socket.emit('move:play', 'junk', {})
    a.socket.emit('room:create', { minutes: 'lots' })
    await sleep(200)
    expect((await request(app).get('/api/health')).body.ok).toBe(true)
    const again = await emit<{ code?: string }>(a.socket, 'room:create', { color: 'w' })
    expect(again.code).toBeTruthy()
    a.socket.emit('game:leave')
    a.socket.close()
  })

  it('a host keeps only one waiting room', async () => {
    const a = await connect('demo', '1234')
    const first = await emit<{ code: string }>(a.socket, 'room:create', { color: 'w' })
    const second = await emit<{ code: string }>(a.socket, 'room:create', { color: 'w' })
    const b = await connect('friend4', 'secret')
    expect((await emit<{ error?: string }>(b.socket, 'room:join', { code: first.code })).error).toMatch(/not found/i)
    expect((await emit<{ error?: string }>(b.socket, 'room:join', { code: second.code })).error).toBeUndefined()
    a.socket.emit('game:resign')
    await sleep(100)
    a.socket.close(); b.socket.close()
  })

  it('draw offer + accept ends in a draw; decline clears the offer', async () => {
    const a = await connect('demo', '1234'), b = await connect('friend4', 'secret')
    await startGame(a, b)
    const offered = once<any>(b.socket, 'room:state', d => d.drawOffer === 'w')
    a.socket.emit('game:offerDraw')
    expect((await offered).drawOffer).toBe('w')
    const cleared = once<any>(a.socket, 'room:state', d => d.drawOffer === null)
    b.socket.emit('game:declineDraw')
    await cleared
    const over = once<any>(a.socket, 'room:state', d => d.status === 'over')
    a.socket.emit('game:offerDraw'); await sleep(50); b.socket.emit('game:offerDraw')
    const end = await over
    expect(end.result).toBe('1/2-1/2'); expect(end.termination).toBe('agreement')
    a.socket.close(); b.socket.close()
  })

  it('a timed game ends on time and the saved PGN carries headers', async () => {
    const a = await connect('demo', '1234'), b = await connect('friend4', 'secret')
    await startGame(a, b, { color: 'w', minutes: 0.02 }) // 1.2 seconds
    const over = once<any>(a.socket, 'room:state', d => d.status === 'over')
    await emit(a.socket, 'move:play', { from: 'e2', to: 'e4' })
    await emit(b.socket, 'move:play', { from: 'e7', to: 'e5' }) // clock now runs for White
    const end = await over
    expect(end.termination).toBe('timeout'); expect(end.result).toBe('0-1')
    const g = await request(app).get(`/api/games/${end.gameId}`).set('Cookie', a.cookie)
    expect(g.body.game.pgn).toContain('[White "demo"]')
    expect(g.body.game.pgn).toContain('[Result "0-1"]')
    expect(g.body.game.pgn).toContain('[Termination "timeout"]')
    a.socket.close(); b.socket.close()
  })

  it('a playing room that both players leave is ended as abandoned', async () => {
    const a = await connect('demo', '1234'), b = await connect('friend4', 'secret')
    const code = await startGame(a, b, { color: 'w', minutes: 0 })
    const c = ioc(url, { extraHeaders: { cookie: a.cookie }, forceNew: true }) // watcher to read the final state
    a.socket.close(); b.socket.close()
    const over = once<any>(c, 'room:state', d => d.status === 'over')
    await sleep(100)
    await emit(c, 'room:join', { code }) // demo reconnects, then drops again
    c.close()
    const d = ioc(url, { extraHeaders: { cookie: a.cookie }, forceNew: true })
    await sleep(900)
    const active = await request(app).get('/api/rooms/active').set('Cookie', a.cookie)
    expect(active.body.room).toBeNull()
    d.close(); void over
  })

  it('throttles repeated failed logins', async () => {
    const { app: app2 } = createApp(openDb(':memory:'))
    let last = 0
    for (let i = 0; i < 12; i++) last = (await request(app2).post('/api/auth/login').send({ username: 'demo', password: 'wrong1' })).status
    expect(last).toBe(429)
    // The right password is also refused while throttled, but normal use never trips it.
    const { app: app3 } = createApp(openDb(':memory:'))
    for (let i = 0; i < 15; i++) expect((await request(app3).post('/api/auth/login').send({ username: 'demo', password: '1234' })).status).toBe(200)
  })
})

describe('rematch', () => {
  const connect = async (username: string, password: string) => {
    let res = await request(app).post('/api/auth/login').send({ username, password })
    if (res.status !== 200) res = await request(app).post('/api/auth/register').send({ username, password })
    const cookie = cookieOf(res)
    return { cookie, socket: ioc(url, { extraHeaders: { cookie }, forceNew: true }) }
  }
  const once = <T,>(s: Socket, ev: string, pred: (d: any) => boolean = () => true) =>
    new Promise<T>(r => { const h = (d: any) => { if (pred(d)) { s.off(ev, h); r(d) } }; s.on(ev, h) })
  const emit = <T,>(s: Socket, ev: string, data?: unknown) => new Promise<T>(r => s.emit(ev, data, r))

  it('needs both players; then restarts in the same room with colours swapped and fresh clocks', async () => {
    const a = await connect('demo', '1234'), b = await connect('friend5', 'secret')
    const { code } = await emit<{ code: string }>(a.socket, 'room:create', { color: 'w', minutes: 5 })
    await emit(b.socket, 'room:join', { code })
    const over1 = once<any>(a.socket, 'room:state', d => d.status === 'over')
    a.socket.emit('game:resign')
    const first = await over1
    expect(first.color).toBe('w')

    // One player asking is not enough; the other sees the request.
    const seen = once<any>(b.socket, 'room:state', d => d.rematch?.w === true)
    a.socket.emit('game:rematch')
    const waiting = await seen
    expect(waiting.status).toBe('over'); expect(waiting.rematch).toEqual({ w: true, b: false })

    const restarted = once<any>(a.socket, 'room:state', d => d.status === 'playing')
    b.socket.emit('game:rematch')
    const s = await restarted
    expect(s.color).toBe('b') // demo was White, now Black
    expect(s.white.username).toBe('friend5'); expect(s.black.username).toBe('demo')
    expect(s.history).toEqual([]); expect(s.result).toBeNull(); expect(s.rematch).toEqual({ w: false, b: false })
    expect(s.clocks).toEqual({ w: 300000, b: 300000 })

    // The new game is playable (White is now friend5) and is saved separately when it ends.
    expect((await emit<any>(b.socket, 'move:play', { from: 'e2', to: 'e4' })).ok).toBe(true)
    const over2 = once<any>(a.socket, 'room:state', d => d.status === 'over')
    a.socket.emit('game:resign')
    const second = await over2
    expect(second.gameId).toBeGreaterThan(first.gameId)
    expect(second.result).toBe('1-0')
    a.socket.close(); b.socket.close()
  })

  it('ignores a rematch request while the game is still running', async () => {
    const a = await connect('demo', '1234'), b = await connect('friend5', 'secret')
    const { code } = await emit<{ code: string }>(a.socket, 'room:create', { color: 'w', minutes: 0 })
    await emit(b.socket, 'room:join', { code })
    a.socket.emit('game:rematch'); b.socket.emit('game:rematch')
    await new Promise(r => setTimeout(r, 150))
    const active = await request(app).get('/api/rooms/active').set('Cookie', a.cookie)
    expect(active.body.room).toEqual({ code, status: 'playing' })
    a.socket.emit('game:resign')
    await new Promise(r => setTimeout(r, 100))
    a.socket.close(); b.socket.close()
  })
})

describe('restart restore', () => {
  it('an unfinished friend game is back after the server restarts', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mwc-restore-')), 'chess.db')
    const boot = async () => {
      const inst = createApp(openDb(file))
      await new Promise<void>(r => inst.server.listen(0, r))
      return { ...inst, url: `http://localhost:${(inst.server.address() as AddressInfo).port}` }
    }
    const login = async (inst: Awaited<ReturnType<typeof boot>>, u: string, p: string) => {
      let res = await request(inst.app).post('/api/auth/login').send({ username: u, password: p })
      if (res.status !== 200) res = await request(inst.app).post('/api/auth/register').send({ username: u, password: p })
      return cookieOf(res)
    }
    const emit = <T,>(s: Socket, ev: string, data?: unknown) => new Promise<T>(r => s.emit(ev, data, r))

    const one = await boot()
    const ca = await login(one, 'demo', '1234'), cb = await login(one, 'friend6', 'secret')
    const a = ioc(one.url, { extraHeaders: { cookie: ca }, forceNew: true }), b = ioc(one.url, { extraHeaders: { cookie: cb }, forceNew: true })
    const { code } = await emit<{ code: string }>(a, 'room:create', { color: 'w', minutes: 5 })
    await emit(b, 'room:join', { code })
    await emit(a, 'move:play', { from: 'e2', to: 'e4' })
    await emit(b, 'move:play', { from: 'e7', to: 'e5' })
    // A second, still-waiting room must come back as well.
    const c = ioc(one.url, { extraHeaders: { cookie: await login(one, 'friend7', 'secret') }, forceNew: true })
    const waiting = await emit<{ code: string }>(c, 'room:create', { color: 'b', minutes: 0 })
    a.close(); b.close(); c.close()
    await new Promise<void>(r => one.io.close(() => r())) // the "crash"

    const two = await boot()
    const a2 = ioc(two.url, { extraHeaders: { cookie: ca }, forceNew: true })
    const state = new Promise<any>(r => a2.on('room:state', d => d.code === code && r(d)))
    expect((await emit<{ error?: string }>(a2, 'room:join', { code })).error).toBeUndefined()
    const s = await state
    expect(s.status).toBe('playing'); expect(s.color).toBe('w')
    expect(s.history).toEqual(['e4', 'e5'])
    expect(s.clocks.w).toBeGreaterThan(250000)
    expect(s.black.username).toBe('friend6')
    expect((await emit<any>(a2, 'move:play', { from: 'g1', to: 'f3' })).ok).toBe(true) // play continues
    const active = await request(two.app).get('/api/rooms/active').set('Cookie', await login(two, 'friend7', 'secret'))
    expect(active.body.room).toEqual({ code: waiting.code, status: 'waiting' })
    a2.close()
    await new Promise<void>(r => two.io.close(() => r()))
  })
})

describe('shared replay links and AI result verification', () => {
  const login = async () => cookieOf(await request(app).post('/api/auth/login').send({ username: 'demo', password: '1234' }))
  const post = async (cookie: string, over: object) => request(app).post('/api/games').set('Cookie', cookie).send({
    mode: 'ai-medium', playerColor: 'w', result: '0-1', termination: 'checkmate', startedAt: Date.now() - 1000, pgn: '1. f3 e5 2. g4 Qh4#', ...over,
  })

  it('every saved game gets a share link anyone can open, without ids or login', async () => {
    const ck = await login()
    const saved = await post(ck, {})
    expect(saved.status).toBe(201)
    const mine = await request(app).get(`/api/games/${saved.body.id}`).set('Cookie', ck)
    const shareId: string = mine.body.game.shareId
    expect(shareId).toMatch(/^[A-Za-z0-9_-]{10}$/)
    const pub = await request(app).get(`/api/games/shared/${shareId}`) // no cookie
    expect(pub.status).toBe(200)
    expect(pub.body.game.pgn).toContain('Qh4#')
    expect(pub.body.game.pgn).toContain('[White "demo"]')
    expect(Object.keys(pub.body.game)).not.toContain('whiteId')
    expect(Object.keys(pub.body.game)).not.toContain('id')
    expect((await request(app).get('/api/games/shared/doesnotexist')).status).toBe(404)
    expect((await request(app).get('/api/games')).status).toBe(401) // listing still needs a login
  })

  it('accepts true endings', async () => {
    const ck = await login()
    expect((await post(ck, {})).status).toBe(201) // fool's mate, human (White) lost
    expect((await post(ck, { termination: 'resignation', pgn: '1. e4 e5' })).status).toBe(201)
    expect((await post(ck, { termination: 'timeout', pgn: '1. e4 e5' })).status).toBe(201) // White to move ran out of time
    expect((await post(ck, { playerColor: 'b', result: '1-0', termination: 'checkmate', pgn: '1. e4 f6 2. d4 g5 3. Qh5#' })).status).toBe(201) // human (Black) mated
    expect((await post(ck, { result: '1/2-1/2', termination: 'stalemate', pgn: '1. e3 a5 2. Qh5 Ra6 3. Qxa5 h5 4. h4 Rah6 5. Qxc7 f6 6. Qxd7+ Kf7 7. Qxb7 Qd3 8. Qxb8 Qh7 9. Qxc8 Kg6 10. Qe6' })).status).toBe(201)
  })

  it('rejects impossible endings', async () => {
    const ck = await login()
    const rejected = async (over: object) => expect((await post(ck, over)).status).toBe(422)
    await rejected({ result: '1-0' }) // mate was delivered by Black
    await rejected({ pgn: '1. e4 e5' }) // no mate on the board
    await rejected({ termination: 'resignation', result: '1-0', pgn: '1. e4 e5' }) // you cannot win by resigning
    await rejected({ termination: 'timeout', result: '1-0', pgn: '1. e4 e5 2. Nf3' }) // computer never flags
    await rejected({ playerColor: 'b', termination: 'timeout', result: '0-1', pgn: '1. e4 e5' }) // Black "wins" because White flagged: not possible vs the computer
    await rejected({ termination: 'timeout', pgn: '1. e4' }) // clock has not started yet
    await rejected({ termination: 'stalemate', result: '1/2-1/2', pgn: '1. e4 e5' })
    await rejected({ termination: 'insufficient material', result: '1/2-1/2', pgn: '1. e4 e5' })
    await rejected({ termination: 'agreement', result: '1/2-1/2', pgn: '1. e4 e5' })
    await rejected({ termination: 'resignation', pgn: '1. f3 e5 2. g4 Qh4#' }) // game was already over
  })
})
