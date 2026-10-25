import express from 'express'
import cookieParser from 'cookie-parser'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { Server } from 'socket.io'
import { openDb, type Db } from './db.js'
import { authRouter } from './auth.js'
import { gamesRouter } from './games.js'
import { attachRooms } from './rooms.js'

export function createApp(db: Db = openDb()) {
  const app = express()
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  app.use('/api/auth', authRouter(db))
  app.use('/api/games', gamesRouter(db))

  const dist = path.resolve(process.cwd(), process.env.CLIENT_DIST || '../client/dist')
  if (fs.existsSync(dist)) {
    app.use(express.static(dist))
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
  }

  const server = http.createServer(app)
  const io = new Server(server)
  attachRooms(io, db)
  return { app, server, io, db }
}
