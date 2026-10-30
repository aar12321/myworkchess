import { useCallback, useEffect, useState } from 'react'

// A tiny History-API router: real URLs so the browser Back button works and replay/room links can be shared.
export type Route =
  | { name: 'lobby' }
  | { name: 'history' }
  | { name: 'replay'; id: number }
  | { name: 'shared'; shareId: string }
  | { name: 'room'; code: string } // code === 'new' while a hosted room is being created
  | { name: 'play' } // game against the computer

export function parseRoute(pathname: string, search = ''): Route {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) {
    const legacy = new URLSearchParams(search).get('room') // old invite links: /?room=CODE
    return legacy ? { name: 'room', code: legacy.toUpperCase().slice(0, 6) } : { name: 'lobby' }
  }
  if (parts[0] === 'games' && parts.length === 1) return { name: 'history' }
  if (parts[0] === 'games' && /^\d+$/.test(parts[1] ?? '')) return { name: 'replay', id: Number(parts[1]) }
  if (parts[0] === 'r' && parts[1]) return { name: 'shared', shareId: parts[1] }
  if (parts[0] === 'room' && parts[1]) return { name: 'room', code: parts[1].toUpperCase().slice(0, 6) }
  if (parts[0] === 'play') return { name: 'play' }
  return { name: 'lobby' }
}

export function navigate(path: string, replace = false) {
  history[replace ? 'replaceState' : 'pushState']({ inApp: true }, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** The in-app "Back" buttons behave like the browser's: go back if we came from inside the app, else go to `fallback`. */
export function goBack(fallback: string) {
  if (history.state?.inApp) history.back()
  else navigate(fallback, true)
}

export function useRoute(): Route {
  const read = () => parseRoute(location.pathname, location.search)
  const [route, setRoute] = useState<Route>(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  return route
}

/** While `active`, the browser Back button doesn't leave the page: `onAttempt` runs instead (e.g. to ask "Close this room?"). */
export function useBackGuard(active: boolean, onAttempt: () => void) {
  const attempt = useCallback(onAttempt, [onAttempt])
  useEffect(() => {
    if (!active) return
    history.pushState({ inApp: true, guard: true }, '', location.href)
    const on = () => {
      history.pushState({ inApp: true, guard: true }, '', location.href)
      attempt()
    }
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [active, attempt])
}
