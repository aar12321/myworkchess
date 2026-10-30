import { test, expect, type Page } from '@playwright/test'
import { login, register, playFirstCard, uniq } from './helpers'

async function finishedAiGame(page: Page) {
  await page.getByTestId('ai-easy').click()
  await playFirstCard(page)
  await expect(page.locator('[data-card]')).toHaveCount(5, { timeout: 40_000 }) // computer replied
  await page.getByTestId('resign').click()
  await page.getByTestId('confirm-yes').click()
  await expect(page.getByTestId('game-over')).toBeVisible()
  await expect(page.getByText('Saving game…')).toBeHidden({ timeout: 10_000 })
}

test('friend rematch: both agree, colours swap, and the new game is playable', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  await login(a)
  await register(b, uniq('rm'), 'secret1')
  await a.getByRole('radio', { name: 'White' }).last().click()
  await a.getByTestId('create-room').click()
  const code = (await a.getByTestId('room-code').textContent())!.trim()
  await b.locator('#code').fill(code)
  await b.getByTestId('join-room').click()
  await expect(a.getByTestId('resign')).toBeVisible()
  await a.getByTestId('resign').click()
  await a.getByTestId('confirm-yes').click()
  await expect(b.getByTestId('game-over')).toContainText('Victory')

  await a.getByTestId('rematch').click()
  await expect(a.getByTestId('rematch')).toHaveText('Waiting for friend…')
  await expect(a.getByTestId('rematch')).toBeDisabled()
  await expect(b.getByTestId('rematch')).toHaveText('Accept rematch')
  await b.getByTestId('rematch').click()

  // Same room, new game: demo is now Black, the friend White and to move.
  await expect(a.getByTestId('game-over')).toHaveCount(0)
  await expect(b.getByTestId('game-over')).toHaveCount(0)
  await expect(a.getByTestId('player-b')).toContainText('demo')
  await expect(b.getByTestId('player-w')).toContainText('You')
  await playFirstCard(b)
  await expect(a.locator('[data-card]')).toHaveCount(5, { timeout: 30_000 })
  await a.getByTestId('resign').click()
  await a.getByTestId('confirm-yes').click()
  await expect(b.getByTestId('game-over')).toContainText('Victory') // the second game is recorded separately
  await b.getByTestId('game-over').getByRole('button', { name: 'Back to lobby' }).click()
  await b.getByRole('button', { name: 'My games' }).click()
  await expect(b.getByTestId('game-list').locator('button')).toHaveCount(2)
})

test('rematch is unavailable once the friend has left', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const bCtx = await browser.newContext()
  const b = await bCtx.newPage()
  await login(a)
  await register(b, uniq('lf'), 'secret1')
  await a.getByTestId('create-room').click()
  const code = (await a.getByTestId('room-code').textContent())!.trim()
  await b.locator('#code').fill(code)
  await b.getByTestId('join-room').click()
  await expect(a.getByTestId('resign')).toBeVisible()
  await a.getByTestId('resign').click()
  await a.getByTestId('confirm-yes').click()
  await bCtx.close() // the friend goes away
  await expect(a.getByTestId('rematch')).toHaveText('Friend left')
  await expect(a.getByTestId('rematch')).toBeDisabled()
})

test('Back button and links: history → replay → back, reload keeps the replay, and a shared link opens without an account', async ({ page, browser }) => {
  await login(page)
  await finishedAiGame(page)
  await page.getByTestId('game-over').getByRole('button', { name: 'Back to lobby' }).click()
  await page.getByRole('button', { name: 'My games' }).click()
  await expect(page).toHaveURL(/\/games$/)
  await page.getByTestId('game-list').locator('button').first().click()
  await expect(page).toHaveURL(/\/games\/\d+$/)
  await expect(page.getByTestId('ply-label')).toContainText('/ 2')

  await page.reload() // a replay URL survives a reload
  await expect(page.getByTestId('ply-label')).toContainText('/ 2')

  await page.getByRole('button', { name: '← Back' }).click() // in-app back = browser back
  await expect(page).toHaveURL(/\/games$/)
  await page.goBack()
  await expect(page).toHaveURL(/localhost:\d+\/$/)
  await expect(page.getByTestId('whoami')).toBeVisible()

  // Shared link: same game, no login.
  const shareId = await page.evaluate(async () => (await (await fetch('/api/games')).json()).games[0].shareId as string)
  expect(shareId).toMatch(/^[A-Za-z0-9_-]{10}$/)
  const guest = await (await browser.newContext()).newPage()
  await guest.goto(`/r/${shareId}`)
  await expect(guest.getByTestId('ply-label')).toContainText('/ 2')
  await expect(guest.getByRole('button', { name: 'Enter' })).toHaveCount(0)
  await guest.goto('/r/nosuchgame1')
  await expect(guest.getByRole('alert')).toContainText('Game not found')
})

test('room invite link: the URL carries the code, a signed-out friend signs up and lands in the room', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage()
  await login(host)
  await host.getByRole('radio', { name: 'White' }).last().click()
  await host.getByTestId('create-room').click()
  await expect(host.getByTestId('room-code')).toBeVisible()
  await expect(host).toHaveURL(/\/room\/[A-Z2-9]{6}$/)
  const link = host.url()

  const friend = await (await browser.newContext()).newPage()
  await friend.goto(link) // signed out: the sign-in screen first
  await register(friend, uniq('iv'), 'secret1', { alreadyOnPage: true })
  await expect(friend.getByTestId('player-w')).toContainText('demo')
  await expect(host.getByTestId('resign')).toBeVisible()
})

test('browser Back in a waiting room asks before closing it', async ({ page }) => {
  await login(page)
  await page.getByTestId('create-room').click()
  await expect(page.getByTestId('room-code')).toBeVisible()
  const url = page.url()
  await page.goBack()
  await expect(page.getByRole('alertdialog')).toContainText('Close this room?')
  await expect(page).toHaveURL(url)
  await page.getByTestId('confirm-no').click()
  await expect(page.getByTestId('room-code')).toBeVisible()
})

test('screen reader support: labelled board squares, card labels and live announcements', async ({ page }) => {
  await login(page)
  await page.getByTestId('ai-easy').click()
  await expect(page.locator('[data-card]')).toHaveCount(5, { timeout: 40_000 })
  await expect(page.getByRole('grid', { name: 'Chess board' })).toBeVisible()
  await expect(page.locator('[data-square="e2"]')).toHaveAttribute('aria-label', 'e2, white pawn')
  await expect(page.locator('[data-square="g8"]')).toHaveAttribute('aria-label', 'g8, black knight')
  await expect(page.locator('[data-square="e4"]')).toHaveAttribute('aria-label', 'e4, empty')
  await expect(page.getByRole('group', { name: 'Your move cards' })).toBeVisible()
  for (const label of await page.locator('[data-card]').evaluateAll(els => els.map(e => e.getAttribute('aria-label')!)))
    expect(label).toMatch(/^[A-Za-z]+, \S+: \w+ from [a-h][1-8] to [a-h][1-8]/)
  await expect(page.getByTestId('live')).toContainText(/Your turn\. 5 move cards/)

  const card = page.locator('[data-card]').first()
  const label = (await card.getAttribute('aria-label'))!
  const to = label.match(/to ([a-h][1-8])/)![1]
  await card.click()
  await page.getByTestId('play-move').click()
  await expect(page.getByTestId('live')).toContainText(/White .* from [a-h][1-8] to [a-h][1-8]|White castles/)
  await expect(page.locator(`[data-square="${to}"]`)).not.toHaveAttribute('aria-label', /empty/)
})

test('lobby shows measured strength facts instead of Elo guesses', async ({ page }) => {
  await login(page)
  await expect(page.getByTestId('strength-medium')).toContainText(/Won \d+ of \d+ games against Easy/)
  await expect(page.getByTestId('strength-hard')).toContainText(/Won \d+ of \d+ games against Medium/)
  await expect(page.locator('body')).not.toContainText('~800')
})

test('Back after reviewing a finished game does not restart it', async ({ page }) => {
  await login(page)
  await finishedAiGame(page)
  await page.getByRole('button', { name: 'Review game' }).click()
  await expect(page).toHaveURL(/\/games\/\d+$/)
  await page.getByRole('button', { name: '← Back' }).click()
  await expect(page.getByTestId('whoami')).toBeVisible() // lobby, not a fresh game
  await expect(page.locator('[data-card]')).toHaveCount(0)
  await page.goForward()
  await expect(page.getByTestId('ply-label')).toBeVisible()
})
