// Thin promise wrapper around the single-threaded Stockfish 16 WASM worker (no CORS headers needed).
// A worker that fails to load or hangs is terminated and re-created on the next search, so one bad load never
// breaks the game for good.
export interface EngineLine { uci: string; multipv: number; cp: number | null; mate: number | null; depth: number }

export interface SearchOpts { multiPv: number; depth: number; skill?: number; movetime?: number }

const LOAD_TIMEOUT_MS = 20_000
const SEARCH_GRACE_MS = 10_000

export class Engine {
  private worker: Worker | null = null
  private ready: Promise<void> | null = null
  private queue: Promise<unknown> = Promise.resolve()

  private boot() {
    if (this.ready) return this.ready
    let worker: Worker
    try { worker = new Worker('/engine/stockfish-nnue-16-single.js') } catch (e) { return Promise.reject(e) }
    this.worker = worker
    const ready = new Promise<void>((resolve, reject) => {
      const fail = (err: Error) => { clearTimeout(timer); if (this.worker === worker) this.terminate(); else worker.terminate(); reject(err) }
      const timer = setTimeout(() => fail(new Error('engine load timeout')), LOAD_TIMEOUT_MS)
      const onMsg = (e: MessageEvent) => {
        const line = String(e.data).trim()
        if (line === 'uciok') worker.postMessage('isready')
        if (line === 'readyok') { clearTimeout(timer); worker.removeEventListener('message', onMsg); resolve() }
      }
      worker.addEventListener('message', onMsg)
      worker.addEventListener('error', () => fail(new Error('engine failed to load')), { once: true })
      worker.postMessage('uci')
    })
    this.ready = ready
    ready.catch(() => undefined)
    return ready
  }

  /** Start loading the engine in the background (call when a game is likely, e.g. on the lobby). */
  preload() { void this.boot().catch(() => undefined) }

  /** Search a position and return the best line for each of the top `multiPv` moves. Searches are serialized. */
  search(fen: string, opts: SearchOpts): Promise<EngineLine[]> {
    const run = async () => {
      await this.boot()
      const w = this.worker
      if (!w) throw new Error('engine unavailable')
      return new Promise<EngineLine[]>((resolve, reject) => {
        const best = new Map<number, EngineLine>()
        const finish = () => { clearTimeout(timer); w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr) }
        const timer = setTimeout(() => { finish(); this.terminate(); reject(new Error('engine search timeout')) }, (opts.movetime ?? 8_000) + SEARCH_GRACE_MS)
        const onErr = () => { finish(); this.terminate(); reject(new Error('engine crashed')) }
        const onMsg = (e: MessageEvent) => {
          const line = String(e.data)
          if (line.startsWith('info') && line.includes(' pv ')) {
            const num = (re: RegExp) => { const m = line.match(re); return m ? Number(m[1]) : null }
            const multipv = num(/multipv (\d+)/) ?? 1
            const pv = line.split(' pv ')[1].trim().split(' ')[0]
            best.set(multipv, { uci: pv, multipv, cp: num(/score cp (-?\d+)/), mate: num(/score mate (-?\d+)/), depth: num(/ depth (\d+)/) ?? 0 })
          } else if (line.startsWith('bestmove')) {
            finish()
            resolve([...best.values()].sort((a, b) => a.multipv - b.multipv))
          }
        }
        w.addEventListener('message', onMsg)
        w.addEventListener('error', onErr, { once: true })
        w.postMessage('ucinewgame')
        w.postMessage(`setoption name MultiPV value ${opts.multiPv}`)
        if (opts.skill !== undefined) w.postMessage(`setoption name Skill Level value ${opts.skill}`)
        w.postMessage(`position fen ${fen}`)
        w.postMessage(opts.movetime ? `go depth ${opts.depth} movetime ${opts.movetime}` : `go depth ${opts.depth}`)
      })
    }
    const p = this.queue.then(run, run)
    this.queue = p.catch(() => undefined)
    return p
  }

  terminate() { this.worker?.terminate(); this.worker = null; this.ready = null }
}

export const engine = new Engine()
