import { motion } from 'framer-motion'
import { useState, type FormEvent } from 'react'
import { api, type User } from '../api'

export function Auth({ onAuth }: { onAuth: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent, creds?: { u: string; p: string }) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const u = creds?.u ?? username, p = creds?.p ?? password
      onAuth(await (mode === 'login' || creds ? api.login(u, p) : api.register(u, p)))
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="min-h-[100dvh] table-bg flex items-center justify-center p-4">
      <motion.form onSubmit={submit} className="panel w-full max-w-sm p-7" initial={{ opacity: 0, y: 30, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 20 }}>
        <motion.div className="text-center text-6xl" animate={{ rotate: [0, -6, 6, 0], y: [0, -4, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}>♞</motion.div>
        <h1 className="font-display font-black text-3xl text-center gold-text mt-1">Knight's Hand</h1>
        <p className="text-center text-parch-300 mb-5">Chess, dealt as cards.</p>

        <div className="flex mb-4 rounded-lg overflow-hidden border border-gold-500/40" role="tablist">
          {(['login', 'register'] as const).map(m => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError('') }}
              className={`flex-1 py-2 font-display text-sm tracking-widest uppercase ${mode === m ? 'bg-gold-500/90 text-bark-900' : 'bg-black/30 text-parch-200'}`}>
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <label className="block text-sm mb-1 text-parch-200" htmlFor="username">Username</label>
        <input id="username" className="input mb-3" value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" />
        <label className="block text-sm mb-1 text-parch-200" htmlFor="password">Password</label>
        <input id="password" type="password" className="input mb-4" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />

        {error && <div role="alert" className="mb-3 text-red-300 text-sm bg-red-950/60 border border-red-500/40 rounded-lg px-3 py-2">{error}</div>}
        <button className="btn-gold w-full" disabled={busy || !username || !password}>{busy ? '…' : mode === 'login' ? 'Enter' : 'Create account'}</button>
        <button type="button" className="btn-ghost w-full mt-3" onClick={e => submit(e as unknown as FormEvent, { u: 'demo', p: '1234' })}>Try the demo account</button>
      </motion.form>
    </div>
  )
}
