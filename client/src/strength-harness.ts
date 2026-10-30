// Dev-only: plays the computer levels against each other with the real move-picking code, to measure how they compare.
// Not part of the production build (Vite only builds index.html). Driven by e2e-tools/measure-strength.mjs.
import { Chess } from 'chess.js'
import { LEVELS, pickEngineMove, type Level } from './engine/ai'
import { Engine } from './engine/stockfish'

const engine = new Engine()
const search = (fen: string, o: Parameters<Engine['search']>[1]) => engine.search(fen, o)

/** A varied start: a few plies chosen at random from the engine's top three moves, so games don't repeat. */
async function opening(chess: Chess, plies: number) {
  for (let i = 0; i < plies; i++) {
    const lines = await search(chess.fen(), { multiPv: 3, depth: 6, movetime: 150 })
    const pool = lines.filter(l => l.uci)
    const pick = pool[Math.floor(Math.random() * pool.length)]
    chess.move({ from: pick.uci.slice(0, 2), to: pick.uci.slice(2, 4), promotion: pick.uci[4] })
  }
}

/** One game. Returns 1 if `white` won, 0 if `black` won, 0.5 for a draw. */
async function playGame(white: Level, black: Level): Promise<number> {
  const chess = new Chess()
  await opening(chess, 4)
  while (!chess.isGameOver() && chess.history().length < 200) {
    const level = chess.turn() === 'w' ? white : black
    const uci = await pickEngineMove(search, chess.fen(), level)
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  }
  if (chess.isCheckmate()) return chess.turn() === 'w' ? 0 : 1
  return 0.5
}

/** `games` games between two levels, alternating colours. Reports results from `strong`'s point of view. */
;(window as any).playMatch = async (strong: Level, weak: Level, games: number) => {
  const res = { strong, weak, games, wins: 0, draws: 0, losses: 0 }
  for (let g = 0; g < games; g++) {
    const strongIsWhite = g % 2 === 0
    const r = strongIsWhite ? await playGame(strong, weak) : 1 - (await playGame(weak, strong))
    if (r === 1) res.wins++; else if (r === 0) res.losses++; else res.draws++
    console.log(`[${strong}-vs-${weak}] game ${g + 1}/${games}: ${r === 1 ? 'win' : r === 0 ? 'loss' : 'draw'} (${res.wins}W ${res.draws}D ${res.losses}L)`)
  }
  return res
}
;(window as any).levels = LEVELS
