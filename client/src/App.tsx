import { useEffect, useState } from 'react'
import { api, type User } from './api'
import { clearAi, loadAi, type SavedAi } from './aiSave'
import { engine } from './engine/stockfish'
import { goBack, navigate, useRoute } from './router'
import { closeSocket } from './socket'
import { Auth } from './screens/Auth'
import { Game } from './screens/Game'
import { History } from './screens/History'
import { Lobby, type GameSetup } from './screens/Lobby'
import { Replay } from './screens/Replay'

interface ActiveGame { setup: GameSetup; key: string | number }

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const route = useRoute()
  const [game, setGame] = useState<ActiveGame | null>(null)
  const [activeRoom, setActiveRoom] = useState<{ code: string; status: string } | null>(null)
  const [savedAi, setSavedAi] = useState<SavedAi | null>(null)

  useEffect(() => { api.me().then(setUser) }, [])
  const onLobby = !!user && route.name === 'lobby'
  useEffect(() => { if (onLobby) { api.activeRoom().then(setActiveRoom); setSavedAi(user ? loadAi(user.id) : null) } }, [onLobby]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (user) engine.preload() }, [user]) // start fetching the engine before the first game

  // Leaving a game screen discards that game's setup, so Back/Forward can never re-enter a finished game as a fresh one.
  useEffect(() => { if (route.name !== 'play' && route.name !== 'room') setGame(null) }, [route.name])

  // A game screen can't be rebuilt from its URL alone (an AI game, or a room still being created): go to the lobby, which offers "Resume".
  const orphan = !!user && ((route.name === 'play' && game?.setup.kind !== 'ai') || (route.name === 'room' && route.code === 'NEW' && game?.setup.kind !== 'create'))
  useEffect(() => { if (orphan) navigate('/', true) }, [orphan])

  // A shared replay link needs no account.
  if (route.name === 'shared') return <Replay source={{ shareId: route.shareId }} user={user ?? null} onBack={() => goBack('/')} />
  if (user === undefined) return <div className="min-h-[100dvh] table-bg flex items-center justify-center text-5xl">♞</div>
  if (!user) return <Auth onAuth={setUser} /> // the URL is kept, so an invite link continues after signing in

  const start = (setup: GameSetup) => {
    if (setup.kind === 'ai' && !setup.resume) clearAi(user.id) // a fresh game replaces any unfinished one
    setGame({ setup, key: Date.now() })
    navigate(setup.kind === 'ai' ? '/play' : setup.kind === 'create' ? '/room/new' : `/room/${setup.code}`, route.name === 'play')
  }
  const exit = () => navigate('/', true)

  switch (route.name) {
    case 'play':
      return game?.setup.kind === 'ai' ? <Game key={game.key} user={user} setup={game.setup} onExit={exit} onRematch={start} onReview={id => navigate(`/games/${id}`, true)} /> : null
    case 'room': {
      // Keep the same Game instance while a hosted room gets its code (the URL changes from /room/new to /room/CODE).
      const current: ActiveGame | null = route.code === 'NEW' ? game
        : game && (game.setup.kind === 'create' || (game.setup.kind === 'join' && game.setup.code === route.code)) ? game
        : { setup: { kind: 'join', code: route.code }, key: `url-${route.code}` }
      return current ? <Game key={current.key} user={user} setup={current.setup} onExit={exit} onRematch={start} onReview={id => navigate(`/games/${id}`, true)} /> : null
    }
    case 'history':
      return <History user={user} onBack={() => goBack('/')} onOpen={id => navigate(`/games/${id}`)} />
    case 'replay':
      return <Replay source={{ id: route.id }} user={user} onBack={() => goBack('/games')} />
    default:
      return <Lobby user={user} activeRoom={activeRoom} savedAi={savedAi} onDiscardAi={() => { clearAi(user.id); setSavedAi(null) }} onStart={start} onHistory={() => navigate('/games')}
        onLogout={async () => { await api.logout(); closeSocket(); setUser(null); navigate('/', true) }} />
  }
}
