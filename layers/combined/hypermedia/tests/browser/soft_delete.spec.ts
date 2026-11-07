import { test } from '@japa/runner'
import limiter from '@adonisjs/limiter/services/main'
import User from '#models/user'
import { setupAccountDatabase } from '#tests/helpers/account_database'
import { softDeleteAdminEmails } from '#services/soft_delete_admins'

// Lucid Soft Delete's example spec, on Account Kit's test database.
const password = 'SoftDeletePass123!'

test.group('soft delete in the browser', (group) => {
  group.each.setup(async () => {
    const cleanup = await setupAccountDatabase()
    await limiter.clear(['memory'])
    softDeleteAdminEmails.add('admin@example.test')
    return async () => {
      softDeleteAdminEmails.clear()
      await cleanup()
    }
  })

  test('an administrator restores a deleted account', async ({ visit, assert }) => {
    await User.create({ email: 'admin@example.test', password })
    const member = await User.create({ email: 'member@example.test', password })
    await member.delete()

    const page = await visit('/login')
    await page.getByLabel('Email').fill('admin@example.test')
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard')

    await page.goto('/admin/deleted-users')
    await page.getByRole('button', { name: 'Restore member@example.test' }).click()
    await page.getByText('member@example.test is restored.').waitFor()
    assert.isNotNull(await User.find(member.id))
  })
})
