import { test } from '@japa/runner'
import limiter from '@adonisjs/limiter/services/main'
import User from '#models/user'
import { setupAccountDatabase } from '../helpers/account_database.js'

// Lucid Soft Delete's example spec, on Account Kit's test database.
const password = 'SoftDeletePass123!'

test.group('soft delete in the browser', (group) => {
  group.each.setup(async () => {
    const cleanup = await setupAccountDatabase()
    await limiter.clear(['memory'])
    return async () => {
      await cleanup()
    }
  })

  test('an administrator restores a deleted account', async ({ visit, assert }) => {
    const admin = await User.create({ email: 'admin@example.test', password })
    admin.isSoftDeleteAdmin = true
    await admin.save()
    const member = await User.create({ email: 'member@example.test', password })
    await member.delete()

    const page = await visit('/login')
    await page.getByLabel('Email').fill('admin@example.test')
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard')

    await page.getByRole('link', { name: 'Deleted accounts' }).click()
    await page.waitForURL('**/admin/deleted-users')
    await page.getByRole('button', { name: 'Restore member@example.test' }).click()
    await page.getByText('member@example.test is restored.').waitFor()
    assert.isNotNull(await User.find(member.id))
  })

  test('a regular member sees account deletion but no administrator link', async ({
    visit,
    assert,
  }) => {
    await User.create({ email: 'admin@example.test', password })

    const page = await visit('/login')
    await page.getByLabel('Email').fill('admin@example.test')
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard')

    assert.equal(await page.getByRole('link', { name: 'Deleted accounts' }).count(), 0)
    await page.getByRole('link', { name: 'Delete account' }).click()
    await page.waitForURL('**/account/delete')
  })
})
