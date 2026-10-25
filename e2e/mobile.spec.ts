import { test, expect, devices } from '@playwright/test'
import { login } from './helpers'

const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13']
test.use({ ...iphone })

test('phone layout: board fits, cards swipe, no horizontal page scroll', async ({ page }) => {
  await login(page)
  await page.getByTestId('ai-medium').click()
  await expect(page.locator('[data-card]')).toHaveCount(5, { timeout: 40_000 })
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  expect(noOverflow).toBe(true)
  const box = (await page.getByTestId('board').boundingBox())!
  expect(box.width).toBeGreaterThan(300)
  expect(Math.abs(box.width - box.height)).toBeLessThan(2)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await page.locator('[data-card]').nth(2).click()
  await expect(page.getByTestId('play-move')).toBeEnabled()
  if (process.env.SHOTS_DIR) await page.waitForTimeout(1500)
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/mobile-game.png` })
  await page.getByRole('button', { name: 'Moves' }).click()
  await expect(page.getByTestId('move-history').last()).toBeVisible()
})
