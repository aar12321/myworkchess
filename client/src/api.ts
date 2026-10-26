export interface User { id: number; username: string }
export interface GameSummary { id: number; whiteLabel: string; blackLabel: string; whiteId: number | null; blackId: number | null; mode: string; result: string; termination: string; endedAt: number }
export interface GameFull extends GameSummary { pgn: string; startedAt: number }

async function req<T>(path: string, body?: unknown, method = body ? 'POST' : 'GET'): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method, credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data as T
}

export const api = {
  me: () => req<{ user: User }>('/auth/me').then(r => r.user).catch(() => null),
  login: (username: string, password: string) => req<{ user: User }>('/auth/login', { username, password }).then(r => r.user),
  register: (username: string, password: string) => req<{ user: User }>('/auth/register', { username, password }).then(r => r.user),
  logout: () => req('/auth/logout', {}),
  saveGame: (g: { mode: string; playerColor: 'w' | 'b'; result: string; termination: string; pgn: string; startedAt: number }) => req<{ id: number }>('/games', g),
  listGames: () => req<{ games: GameSummary[] }>('/games').then(r => r.games),
  activeRoom: () => req<{ room: { code: string; status: string } | null }>('/rooms/active').then(r => r.room).catch(() => null),
  getGame: (id: number) => req<{ game: GameFull }>(`/games/${id}`).then(r => r.game),
}
