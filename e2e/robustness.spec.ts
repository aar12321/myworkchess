import { test, expect, devices } from '@playwright/test'
import { login, register, playFirstCard, uniq } from './helpers'

test('engine blocked: cards and computer replies still work, with a visible notice', async ({ page }) => {
  await page.route('**/engine/**', r => r.abort())
  await login(page)
  await page.getByTestId('ai-easy').click()
  await expect(page.locator('[data-card]')).toHaveCount(5, { timeout: 40_000 })
  await expect(page.getByText('Chess engine unavailable')).toBeVisible()
  await playFirstCard(page)
  // The computer must still answer using the fallback.
  await expect(page.locator('[data-card]')).toHaveCount(5, { timeout: 40_000 })
  await expect(page.locator('[data-testid="move-history"] button:not([disabled])')).toHaveCount(0) // history lists both moves (disabled buttons)
  await expect(page.locator('[data-testid="move-history"]').first()).toContainText(/\d\./)
})

test('refreshing an AI game keeps it: resume from the lobby', async ({ page }) => {
  await login(page)
  await page.getByTestId('ai-easy').click()
  await playFirstCard(page)
  await expect(page.locator('[data-card]')).toHaveCount(5, { timeout: 40_000 }) // computer replied
  await page.reload()
  await expect(page.getByTestId('resume-ai-banner')).toBeVisible()
  await page.getByTestId('resume-ai').click()
  await expect(page.locator('[data-card]')).toHaveCount(5, { timeout: 40_000 })
  const buttons = page.locator('[data-testid="move-history"]').first().locator('button')
  await expect(buttons).toHaveCount(2) // one move each, restored
  // Resigning clears the saved game.
  await page.getByTestId('resign').click()
  await page.getByTestId('confirm-yes').click()
  await page.getByTestId('game-over').getByRole('button', { name: 'Back to lobby' }).click()
  await expect(page.getByTestId('resume-ai-banner')).toHaveCount(0)
})

test('resign can be cancelled, and the game-over popup can be dismissed to view the board', async ({ page }) => {
  await login(page)
  await page.getByTestId('ai-easy').click()
  await page.getByTestId('resign').click()
  await page.getByTestId('confirm-no').click()
  await expect(page.getByTestId('game-over')).toHaveCount(0)
  await page.getByTestId('resign').click()
  await page.getByTestId('confirm-yes').click()
  await expect(page.getByTestId('game-over')).toBeVisible()
  await page.getByTestId('view-board').click()
  await expect(page.getByTestId('game-over')).toHaveCount(0)
  await page.getByTestId('show-result').click()
  await expect(page.getByTestId('game-over')).toBeVisible()
})

test('closing a waiting room asks first', async ({ page }) => {
  await login(page)
  await page.getByTestId('create-room').click()
  await expect(page.getByTestId('room-code')).toBeVisible()
  await page.getByRole('button', { name: 'Back to lobby' }).click()
  await page.getByTestId('confirm-no').click()
  await expect(page.getByTestId('room-code')).toBeVisible()
  await page.getByRole('button', { name: 'Back to lobby' }).click()
  await page.getByTestId('confirm-yes').click()
  await expect(page.getByTestId('whoami')).toBeVisible()
})

test('replay offers copy and download of the PGN with headers', async ({ page }) => {
  await login(page)
  await page.getByTestId('ai-easy').click()
  await page.getByTestId('resign').click()
  await page.getByTestId('confirm-yes').click()
  await page.getByRole('button', { name: 'Review game' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-pgn').click()])
  expect(download.suggestedFilename()).toMatch(/\.pgn$/)
  const text = await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8')
  expect(text).toContain('[White "demo"]')
  expect(text).toContain('[Termination "resignation"]')
  await expect(page.getByTestId('copy-pgn')).toBeVisible()
})

const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13']

test.describe('phone', () => {
  test.use({ ...iphone })

  test('friend-game header fits a 360px phone; Draw and Resign live in the ⋯ menu', async ({ browser }) => {
    const small = { ...iphone, viewport: { width: 360, height: 640 } }
    const a = await (await browser.newContext(small)).newPage()
    const b = await (await browser.newContext(small)).newPage()
    await login(a)
    await register(b, uniq('ph'), 'secret1')
    await a.getByRole('radio', { name: 'White' }).last().click()
    await a.getByTestId('create-room').click()
    const code = (await a.getByTestId('room-code').textContent())!.trim()
    await b.locator('#code').fill(code)
    await b.getByTestId('join-room').click()
    await expect(a.getByTestId('game-menu')).toBeVisible()
    for (const page of [a, b]) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      for (const btn of await page.locator('header button').all()) {
        const box = (await btn.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(360.5)
      }
    }
    const board = (await a.getByTestId('board').boundingBox())!
    expect(board.width).toBeGreaterThan(250)
    // Resign works through the menu.
    await a.getByTestId('game-menu').click()
    await a.getByTestId('resign').click()
    await a.getByTestId('confirm-yes').click()
    await expect(a.getByTestId('game-over')).toContainText('Defeat')
    await expect(b.getByTestId('game-over')).toContainText('Victory')
  })

  test('sideways phone shows a rotate hint instead of a squashed board', async ({ browser }) => {
    const ctx = await browser.newContext({ ...iphone, viewport: { width: 844, height: 390 } })
    const page = await ctx.newPage()
    await login(page)
    await page.getByTestId('ai-easy').click()
    await expect(page.getByText('Turn your phone upright')).toBeVisible()
    await page.setViewportSize({ width: 390, height: 664 })
    await expect(page.getByText('Turn your phone upright')).toBeHidden()
  })
})
