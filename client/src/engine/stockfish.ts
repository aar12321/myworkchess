// Thin promise wrapper around the single-threaded Stockfish 16 WASM worker (no CORS headers needed).
export interface EngineLine { uci: string; multipv: number; cp: number | null; mate: number | null; depth: number }

export interface SearchOpts { multiPv: number; depth: number; skill?: number; movetime?: number }

export class Engine {
  private worker: Worker | null = null
  private ready: Promise<void> | null = null
  private queue: Promise<unknown> = Promise.resolve()

  private boot() {
    if (this.ready) return this.ready
    this.worker = new Worker('/engine/stockfish-nnue-16-single.js')
    this.ready = new Promise<void>((resolve, reject) => {
      const w = this.worker!
      const onMsg = (e: MessageEvent) => {
        const line = String(e.data).trim()
        if (line === 'uciok') w.postMessage('isready')
        if (line === 'readyok') { w.removeEventListener('message', onMsg); resolve() }
      }
      w.addEventListener('message', onMsg)
      w.addEventListener('error', () => reject(new Error('engine failed to load')), { once: true })
      w.postMessage('uci')
    })
    return this.ready
  }

  /** Search a position and return the best line for each of the top `multiPv` moves. Searches are serialized. */
  search(fen: string, opts: SearchOpts): Promise<EngineLine[]> {
    const run = async () => {
      await this.boot()
      const w = this.worker!
      return new Promise<EngineLine[]>(resolve => {
        const best = new Map<number, EngineLine>()
        const onMsg = (e: MessageEvent) => {
          const line = String(e.data)
          if (line.startsWith('info') && line.includes(' pv ')) {
            const num = (re: RegExp) => { const m = line.match(re); return m ? Number(m[1]) : null }
            const multipv = num(/multipv (\d+)/) ?? 1
            const pv = line.split(' pv ')[1].trim().split(' ')[0]
            best.set(multipv, { uci: pv, multipv, cp: num(/score cp (-?\d+)/), mate: num(/score mate (-?\d+)/), depth: num(/ depth (\d+)/) ?? 0 })
          } else if (line.startsWith('bestmove')) {
            w.removeEventListener('message', onMsg)
            resolve([...best.values()].sort((a, b) => a.multipv - b.multipv))
          }
        }
        w.addEventListener('message', onMsg)
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
