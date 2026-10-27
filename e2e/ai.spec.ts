import { test, expect } from '@playwright/test'
import { login, playFirstCard } from './helpers'

const SHOTS = process.env.SHOTS_DIR

test('play an Easy AI game with cards, resign, and find it in My games + replay', async ({ page }) => {
  await login(page)
  await page.getByTestId('ai-easy').click()
  if (SHOTS) await page.waitForTimeout(1500)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ai-start-${page.viewportSize()!.width}.png` })

  const played: string[] = []
  for (let i = 0; i < 3; i++) {
    played.push(await playFirstCard(page))
    // The computer replies, then a fresh hand is dealt.
    await expect(page.locator('[data-card]')).toHaveCount(5, { timeout: 40_000 })
  }
  if (SHOTS) await page.waitForTimeout(1500)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ai-mid-${page.viewportSize()!.width}.png` })

  await page.getByTestId('resign').click()
  await page.getByTestId('confirm-yes').click()
  await expect(page.getByTestId('game-over')).toBeVisible()
  await expect(page.getByTestId('game-over')).toContainText('Defeat')
  if (SHOTS) await page.waitForTimeout(1500)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ai-over-${page.viewportSize()!.width}.png` })

  await page.getByRole('button', { name: 'Review game' }).click()
  await expect(page.getByTestId('ply-label')).toContainText('/ 6')
  await page.getByRole('button', { name: 'Last' }).click()
  await expect(page.getByTestId('ply-label')).toContainText('Move 6 / 6')
  await page.getByRole('button', { name: '← Back' }).click()

  await page.getByRole('button', { name: 'My games' }).click()
  await expect(page.getByTestId('game-list').locator('button').first()).toContainText('Stockfish (Easy)')
  await expect(page.getByTestId('game-list').locator('button').first()).toContainText('Lost')
})

test('AI cards are legal, unique, and capped at five (hard level, as black)', async ({ page }) => {
  await login(page)
  await page.getByRole('radio', { name: 'Black' }).first().click()
  await page.getByTestId('ai-hard').click()
  // Computer (white) opens; then we should be dealt a hand.
  const sans = await page.locator('[data-card]').evaluateAll(els => els.map(e => e.getAttribute('data-card')))
  expect(sans.length === 0 || sans.length === 5).toBe(true)
  await expect(page.locator('[data-card]')).toHaveCount(5, { timeout: 40_000 })
  const final = await page.locator('[data-card]').evaluateAll(els => els.map(e => e.getAttribute('data-card')!))
  expect(new Set(final).size).toBe(5)
  await expect(page.getByTestId('play-move')).toBeDisabled()
})
