import { test, expect } from '@playwright/test'
import { login, register, uniq } from './helpers'

test('demo account can sign in and out', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible()
})

test('wrong password shows an error', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Username').fill('demo')
  await page.getByLabel('Password').fill('nope')
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByRole('alert')).toContainText('Wrong username or password')
})

test('new user can register, sign out, and sign back in; session survives reload', async ({ page }) => {
  const name = uniq('user')
  await register(page, name, 'hunter22')
  await page.reload()
  await expect(page.getByTestId('whoami')).toHaveText(name)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await login(page, name, 'hunter22')
})

test('duplicate username and short password are rejected', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Create account' }).click()
  await page.getByLabel('Username').fill('DEMO')
  await page.getByLabel('Password').fill('abcd')
  await page.getByRole('button', { name: 'Create account' }).last().click()
  await expect(page.getByRole('alert')).toContainText('taken')
  await page.getByLabel('Username').fill(uniq('ok'))
  await page.getByLabel('Password').fill('12')
  await page.getByRole('button', { name: 'Create account' }).last().click()
  await expect(page.getByRole('alert')).toContainText('at least 4')
})
