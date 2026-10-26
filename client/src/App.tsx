import { useEffect, useState } from 'react'
import { api, type User } from './api'
import { closeSocket } from './socket'
import { Auth } from './screens/Auth'
import { Game } from './screens/Game'
import { History } from './screens/History'
import { Lobby, type GameSetup } from './screens/Lobby'
import { Replay } from './screens/Replay'

type Screen = { name: 'lobby' } | { name: 'game'; setup: GameSetup; key: number } | { name: 'history' } | { name: 'replay'; id: number; from: 'history' | 'lobby' }

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [screen, setScreen] = useState<Screen>({ name: 'lobby' })
  const [activeRoom, setActiveRoom] = useState<{ code: string; status: string } | null>(null)
  const [invite] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase().slice(0, 6) ?? '')

  useEffect(() => { api.me().then(setUser) }, [])
  const onLobby = user && screen.name === 'lobby'
  useEffect(() => { if (onLobby) api.activeRoom().then(setActiveRoom) }, [onLobby])
  if (user === undefined) return <div className="min-h-[100dvh] table-bg flex items-center justify-center text-5xl">♞</div>
  if (!user) return <Auth onAuth={u => { setUser(u); setScreen({ name: 'lobby' }) }} />

  const lobby = () => { if (invite) history.replaceState(null, '', '/'); setScreen({ name: 'lobby' }) }
  const start = (setup: GameSetup) => setScreen({ name: 'game', setup, key: Date.now() })

  switch (screen.name) {
    case 'game':
      return <Game key={screen.key} user={user} setup={screen.setup} onExit={lobby} onRematch={start} onReview={id => setScreen({ name: 'replay', id, from: 'lobby' })} />
    case 'history':
      return <History user={user} onBack={lobby} onOpen={id => setScreen({ name: 'replay', id, from: 'history' })} />
    case 'replay':
      return <Replay id={screen.id} user={user} onBack={() => setScreen(screen.from === 'history' ? { name: 'history' } : { name: 'lobby' })} />
    default:
      return <Lobby user={user} initialCode={invite} activeRoom={activeRoom} onStart={start} onHistory={() => setScreen({ name: 'history' })}
        onLogout={async () => { await api.logout(); closeSocket(); setUser(null) }} />
  }
}
