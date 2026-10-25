# Knight's Hand — chess, dealt as cards

Each turn the engine finds the **five best legal moves** and deals them to you as cards. Pick a card, press **Play Move**.

- **vs computer** — Easy / Medium / Hard (Stockfish 16 in the browser, weakened by skill level, search depth and move variety).
- **vs a friend** — create a room, share the 6-letter code (or the invite link), your friend joins. Both players get cards. Server-side move validation and clocks.
- **Every finished game is recorded** (PGN, result, how it ended) and can be replayed from *My games*.
- Username + password accounts. A seeded demo account: **`demo` / `1234`**.
- Responsive: desktop table layout and a phone layout (five cards across, bottom sheet for move history). Animated pieces, card dealing, sound (mutable).

## Run it

```bash
npm install
npm run dev          # client http://localhost:5173 , server :3001
```

Production (one process serves the API, websockets and the built client):

```bash
npm run build
PORT=3000 JWT_SECRET=change-me npm start
```

Env: `PORT`, `JWT_SECRET` (set in production), `DB_FILE` (default `server/data/chess.db`, SQLite), `INSECURE_COOKIES=1` only if serving production over plain http.

## Tests

```bash
npm test          # server (auth, games, rooms) + client (card hand) unit tests
npm run e2e       # Playwright: auth, AI game, two-player game, phone layout
```
Playwright uses the preinstalled Chromium (`CHROMIUM_PATH` to override). Set `SHOTS_DIR` to save screenshots.

## Layout

- `server/` — Express, Socket.IO, better-sqlite3 (`auth.ts`, `games.ts`, `rooms.ts`, `db.ts`)
- `client/src/engine/` — Stockfish wrapper, `hand.ts` (card dealing), `ai.ts` (difficulty levels)
- `client/src/components/`, `client/src/screens/` — UI
- `e2e/` — Playwright specs

## Credits & licences

- Stockfish.js 16 (GPL-3) from the `stockfish` npm package — shipping this publicly means keeping the source available.
- Piece set *cburnett* by Colin M.L. Burnett (GPL-2+ / CC-BY-SA), via the Lichess repository.
- Table, card-back and avatar art generated with Canva.
