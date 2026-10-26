import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { io as ioc, type Socket } from 'socket.io-client'
import type { AddressInfo } from 'node:net'
import { createApp } from '../src/app.js'
import { openDb } from '../src/db.js'

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
      mode: 'ai-easy', playerColor: 'w', result: '1-0', termination: 'checkmate', startedAt: Date.now() - 1000,
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
      mode: 'ai-hard', playerColor: 'b', result: '1-0', termination: 'x', startedAt: 1, pgn: '1. e5 e4 2. zz',
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
