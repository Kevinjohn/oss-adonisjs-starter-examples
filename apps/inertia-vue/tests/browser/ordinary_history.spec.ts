import { test } from '@japa/runner'
import limiter from '@adonisjs/limiter/services/main'
import User from '#models/user'
import { setupAccountDatabase } from '../helpers/account_database.js'

const password = 'HistoryPass123!'

test.group('ordinary browser history', (group) => {
  group.each.setup(async () => {
    const cleanup = await setupAccountDatabase()
    await limiter.clear(['memory'])
    return cleanup
  })

  test('returns to signed-in team pages and public pages after a dashboard visit', async ({
    visit,
    assert,
  }) => {
    await User.create({ email: 'owner@example.test', password })
    const page = await visit('/login')
    await page.getByLabel('Email').fill('owner@example.test')
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('heading', { name: 'Your dashboard is ready' }).waitFor()

    await page.getByRole('link', { name: 'Teams' }).click()
    await page.getByRole('heading', { name: 'Your teams' }).waitFor()
    await page.goBack()
    await page.getByRole('heading', { name: 'Your dashboard is ready' }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/dashboard')
    await page.goForward()
    await page.getByRole('heading', { name: 'Your teams' }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/teams')

    await page.getByRole('link', { name: 'Account Kit' }).click()
    await page.getByRole('heading', { name: 'Welcome to AdonisJS Account Kit.' }).waitFor()
    await page.goBack()
    await page.getByRole('heading', { name: 'Your teams' }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/teams')
    await page.goForward()
    await page.getByRole('heading', { name: 'Welcome to AdonisJS Account Kit.' }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/')
  })
})
