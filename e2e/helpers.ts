import { expect, type Page } from '@playwright/test'

export const uniq = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`.slice(0, 20)

export async function login(page: Page, username = 'demo', password = '1234') {
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByTestId('whoami')).toHaveText(username)
}

export async function register(page: Page, username: string, password: string) {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Create account' }).click()
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).last().click()
  await expect(page.getByTestId('whoami')).toHaveText(username)
}

/** Waits for a full hand of cards, picks the first, and plays it. Returns the SAN played. */
export async function playFirstCard(page: Page) {
  const cards = page.locator('[data-card]')
  await expect(cards).toHaveCount(5, { timeout: 30_000 })
  const card = cards.first()
  const san = (await card.getAttribute('data-card'))!
  await card.click()
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('play-move').click()
  return san
}
