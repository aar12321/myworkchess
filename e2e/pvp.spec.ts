import { test, expect } from '@playwright/test'
import { login, register, playFirstCard, uniq } from './helpers'

test('two players: create room, join with the code, play cards, resign, both record the game', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  const friend = uniq('friend')

  await login(a)
  await register(b, friend, 'secret1')

  await a.getByRole('radio', { name: 'White' }).first().click()
  await a.getByTestId('create-room').click()
  const code = (await a.getByTestId('room-code').textContent())!.trim()
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  if (process.env.SHOTS_DIR) await a.screenshot({ path: `${process.env.SHOTS_DIR}/pvp-waiting-${a.viewportSize()?.width ?? 'x'}.png` })

  await b.locator('#code').fill(code)
  await b.getByTestId('join-room').click()
  await expect(b.getByTestId('player-w')).toContainText('demo')

  // White (demo) moves first; then black (friend).
  const w1 = await playFirstCard(a)
  await expect(b.locator(`[data-card]`)).toHaveCount(5, { timeout: 30_000 })
  await playFirstCard(b)
  await expect(a.locator('[data-card]')).toHaveCount(5, { timeout: 30_000 })
  expect(w1).toBeTruthy()

  a.once('dialog', d => d.accept())
  await a.getByTestId('resign').click()
  await expect(a.getByTestId('game-over')).toContainText('Defeat')
  await expect(b.getByTestId('game-over')).toContainText('Victory')

  await a.getByTestId('game-over').getByRole('button', { name: 'Back to lobby' }).click()
  await a.getByRole('button', { name: 'My games' }).click()
  await expect(a.getByTestId('game-list').locator('button').first()).toContainText(friend)
  await b.getByRole('button', { name: 'Review game' }).click()
  await expect(b.getByTestId('ply-label')).toContainText('/ 2')
})

test('joining a bad code shows an error', async ({ page }) => {
  await login(page)
  await page.locator('#code').fill('ZZZZZZ')
  await page.getByTestId('join-room').click()
  await expect(page.getByRole('alert')).toContainText('Room not found')
})
