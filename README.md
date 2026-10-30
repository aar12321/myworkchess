# Knight's Hand — chess, dealt as cards

Each turn the engine finds the **five best legal moves** and deals them to you as cards. Pick a card, press **Play Move**.

- **vs computer** — Easy / Medium / Hard (Stockfish 16 in the browser, weakened by skill level, search depth and move variety).
  Measured strength (16 games per pairing, colours alternated, 2026-10-30): Medium beat Easy 16–0 and Hard beat Medium 16–0, so the levels are clearly separated; no Elo rating is claimed. Re-measure with `e2e-tools/measure-strength.mjs`.
- **vs a friend** — create a room, share the 6-letter code or the invite link (`/room/CODE`), your friend joins. Both players get cards, with an optional timer. Server-side move validation and clocks, and a **rematch** button (colours swap) once the game ends.
- **Every finished game is recorded** (PGN with players/date/result, how it ended) and can be replayed from *My games*. Each game has a **share link** (`/r/ID`) that anyone can open without an account, and PGN can be copied or downloaded.
- Real URLs: the browser Back button and reload work (`/games`, `/games/ID`, `/room/CODE`).
- Screen-reader support: the board is a labelled grid, moves, dealt cards and results are announced.
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

Environment (server):

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default 3001). |
| `JWT_SECRET` | **Required when `NODE_ENV=production`** (the server refuses to start without it). |
| `DB_FILE` | SQLite file (default `server/data/chess.db`). Use a persistent disk when hosting. |
| `SEED_DEMO=0` | Don't create the public `demo` / `1234` account (do this for a public deployment). |
| `TRUST_PROXY=1` | Set when behind a reverse proxy so rate limits see real client IPs. |
| `INSECURE_COOKIES=1` | Only if serving a production build over plain http. |
| `LOGIN_FAIL_MAX`, `REGISTER_MAX` | Failed-login limit per 15 min (default 10) and sign-ups per hour (default 20) per IP. |
| `ABANDON_MS` | How long a running friend game with both players gone survives before it is ended as abandoned (default 10 min). |

Notes:
- Unfinished friend games are saved in the database after every move, so a server restart or deploy doesn't end them (players reconnect and carry on; clock time while the server was down isn't charged). This needs `DB_FILE` on a **persistent disk**: on hosts that wipe the disk on deploy, accounts and saved games are lost too.
- Unfinished AI games are kept in the browser (localStorage) and can be resumed from the lobby.
- AI game results are reported by the browser, so the server replays each submitted game and rejects endings that can't be true (a "checkmate" that isn't one, a win on time against the computer). It cannot prove the moves really came from the computer, so a deliberately constructed game can still be saved: don't build rankings on it.

## Tests

```bash
npm test          # server (auth, games, rooms, rate limits) + client (card hand, piece tracker) unit tests
npm run e2e       # Playwright: auth, AI games, friend games, resume, engine-failure fallback, phone layout
```
Playwright uses the preinstalled Chromium (`CHROMIUM_PATH` to override). Set `SHOTS_DIR` to save screenshots.

## Layout

- `server/` — Express, Socket.IO, better-sqlite3 (`auth.ts`, `games.ts`, `rooms.ts`, `db.ts`)
- `client/src/engine/` — Stockfish wrapper, `hand.ts` (card dealing), `ai.ts` (difficulty levels), `strength.json` (measured level strength)
- `e2e-tools/measure-strength.mjs` — plays the levels against each other to produce `strength.json` (start `npm run dev -w client`, then `node e2e-tools/measure-strength.mjs [gamesPerPair]`)
- `client/src/components/`, `client/src/screens/` — UI
- `e2e/` — Playwright specs

## Credits & licences

- Stockfish.js 16 (GPL-3) from the `stockfish` npm package — shipping this publicly means keeping the source available.
- Piece set *cburnett* by Colin M.L. Burnett (GPL-2+ / CC-BY-SA), via the Lichess repository.
- Card-back and avatar art generated with Canva; the wooden table is drawn in CSS.
