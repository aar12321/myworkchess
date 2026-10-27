import { Router, type Request, type Response, type NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { rateLimit } from 'express-rate-limit'
import type { Db } from './db.js'

export const COOKIE = 'mwc_token'
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET)
  throw new Error('JWT_SECRET must be set when NODE_ENV=production')
const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me'

export interface AuthUser { id: number; username: string }

export function signToken(u: AuthUser) {
  return jwt.sign(u, SECRET, { expiresIn: '30d' })
}
export function verifyToken(token?: string): AuthUser | null {
  if (!token) return null
  try {
    const p = jwt.verify(token, SECRET) as AuthUser
    return { id: p.id, username: p.username }
  } catch { return null }
}

declare global { namespace Express { interface Request { user?: AuthUser } } }

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const u = verifyToken(req.cookies?.[COOKIE])
  if (!u) return res.status(401).json({ error: 'Not signed in' })
  req.user = u
  next()
}

const creds = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9_]{3,20}$/, 'Username must be 3-20 letters, numbers or _'),
  password: z.string().min(4, 'Password must be at least 4 characters').max(100),
})

function setCookie(res: Response, u: AuthUser) {
  res.cookie(COOKIE, signToken(u), { httpOnly: true, sameSite: 'lax', maxAge: 30 * 864e5, secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1' })
}

export function authRouter(db: Db) {
  const r = Router()
  // Only failed logins count, so normal use is never throttled but password guessing is.
  const loginLimit = rateLimit({ windowMs: 15 * 60_000, limit: Number(process.env.LOGIN_FAIL_MAX) || 10, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many failed attempts. Try again in a few minutes.' } })
  const registerLimit = rateLimit({ windowMs: 60 * 60_000, limit: Number(process.env.REGISTER_MAX) || 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many accounts created from this network. Try again later.' } })

  r.post('/register', registerLimit, (req, res) => {
    const p = creds.safeParse(req.body)
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message })
    const { username, password } = p.data
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username))
      return res.status(409).json({ error: 'That username is taken' })
    const info = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)')
      .run(username, bcrypt.hashSync(password, 10), Date.now())
    const user = { id: Number(info.lastInsertRowid), username }
    setCookie(res, user)
    res.status(201).json({ user })
  })

  r.post('/login', loginLimit, (req, res) => {
    const p = creds.safeParse(req.body)
    if (!p.success) return res.status(400).json({ error: 'Enter your username and password' })
    const row = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(p.data.username) as
      { id: number; username: string; password_hash: string } | undefined
    if (!row || !bcrypt.compareSync(p.data.password, row.password_hash))
      return res.status(401).json({ error: 'Wrong username or password' })
    const user = { id: row.id, username: row.username }
    setCookie(res, user)
    res.json({ user })
  })

  r.post('/logout', (_req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }) })

  r.get('/me', (req, res) => {
    const u = verifyToken(req.cookies?.[COOKIE])
    if (!u) return res.status(401).json({ error: 'Not signed in' })
    res.json({ user: u })
  })
  return r
}
