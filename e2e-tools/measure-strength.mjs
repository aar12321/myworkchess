// Plays the computer levels against each other in headless Chromium and writes client/src/engine/strength.json.
// Usage: start the client dev server (`npm run dev -w client`), then `node e2e-tools/measure-strength.mjs [gamesPerPair]`.
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const GAMES = Number(process.argv[2]) || 16
const BASE = process.env.BASE || 'http://localhost:5173'
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const pairs = [['medium', 'easy'], ['hard', 'medium'], ['hard', 'easy']]

const browser = await chromium.launch(exe ? { executablePath: exe } : {})
const results = await Promise.all(pairs.map(async ([strong, weak]) => {
  const page = await browser.newPage()
  page.on('console', m => { if (m.text().startsWith('[')) console.log(m.text()) })
  page.on('pageerror', e => console.error('page error:', e.message))
  await page.goto(`${BASE}/strength.html`)
  await page.waitForFunction(() => typeof window.playMatch === 'function')
  const r = await page.evaluate(([s, w, n]) => window.playMatch(s, w, n), [strong, weak, GAMES])
  await page.close()
  return r
}))
await browser.close()

const out = { measured: true, measuredOn: new Date().toISOString().slice(0, 10), gamesPerPair: GAMES, pairs: {} }
for (const r of results) out.pairs[`${r.strong}-vs-${r.weak}`] = { wins: r.wins, draws: r.draws, losses: r.losses, games: r.games }
fs.writeFileSync(new URL('../client/src/engine/strength.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
console.log('Wrote strength.json', JSON.stringify(out))
