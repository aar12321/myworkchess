import { test, expect } from '@playwright/test'
import { login, register, playFirstCard, uniq } from './helpers'

test('AI game with No timer shows no clocks', async ({ page }) => {
  await login(page)
  await page.getByTestId('time-0').first().click()
  await page.getByTestId('ai-easy').click()
  await expect(page.locator('[data-card]')).toHaveCount(5, { timeout: 40_000 })
  await expect(page.getByTestId('clock-w')).toHaveCount(0)
  await expect(page.getByTestId('clock-b')).toHaveCount(0)
  await playFirstCard(page)
  await expect(page.locator('[data-card]')).toHaveCount(5, { timeout: 40_000 })
})

test('timed AI game still shows clocks', async ({ page }) => {
  await login(page)
  await page.getByTestId('time-5').first().click()
  await page.getByTestId('ai-easy').click()
  await expect(page.getByTestId('clock-w')).toContainText('05:00')
})

test('friend game with No timer: no clocks, moves work', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  await login(a)
  await register(b, uniq('nt'), 'secret1')
  await a.getByRole('radio', { name: 'White' }).last().click()
  await a.getByTestId('time-0').last().click()
  await a.getByTestId('create-room').click()
  const code = (await a.getByTestId('room-code').textContent())!.trim()
  await b.locator('#code').fill(code)
  await b.getByTestId('join-room').click()
  await expect(b.getByTestId('player-w')).toContainText('demo')
  await expect(a.getByTestId('clock-w')).toHaveCount(0)
  await expect(b.getByTestId('clock-b')).toHaveCount(0)
  await playFirstCard(a)
  await expect(b.locator('[data-card]')).toHaveCount(5, { timeout: 30_000 })
  a.once('dialog', d => d.accept())
  await a.getByTestId('resign').click()
  await expect(b.getByTestId('game-over')).toContainText('Victory')
})

test('host closes the page before the friend joins; the room survives and the host can resume', async ({ browser }) => {
  const hostCtx = await browser.newContext()
  const host = await hostCtx.newPage()
  const friend = await (await browser.newContext()).newPage()
  await login(host)
  await register(friend, uniq('rs'), 'secret1')
  await host.getByRole('radio', { name: 'White' }).last().click()
  await host.getByTestId('create-room').click()
  const code = (await host.getByTestId('room-code').textContent())!.trim()
  await host.close() // tab killed / phone suspended the browser

  await friend.locator('#code').fill(code)
  await friend.getByTestId('join-room').click()
  await expect(friend.getByTestId('player-w')).toContainText('demo')
  await expect(friend.getByRole('alert')).toHaveCount(0)

  const host2 = await hostCtx.newPage() // host reopens the site
  await host2.goto('/')
  await expect(host2.getByTestId('resume-banner')).toContainText(code)
  await host2.getByTestId('resume-room').click()
  await expect(host2.getByTestId('player-b')).toBeVisible()
  await playFirstCard(host2) // white moves, so the resumed seat really works
  await expect(friend.locator('[data-card]')).toHaveCount(5, { timeout: 30_000 })
  friend.once('dialog', d => d.accept())
  await friend.getByTestId('resign').click() // leave nothing running for later tests
  await expect(friend.getByTestId('game-over')).toBeVisible()
})

test('joining your own room from a second tab explains why it fails', async ({ browser }) => {
  const ctx = await browser.newContext()
  const one = await ctx.newPage(), two = await ctx.newPage()
  await login(one)
  await one.getByTestId('create-room').click()
  const code = (await one.getByTestId('room-code').textContent())!.trim()
  await two.goto('/')
  await two.getByTestId('resume-room').click() // the same account opening the room in another tab
  await expect(two.getByRole('alert')).toContainText('your own room')
})
