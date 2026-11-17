import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import User from '#models/user'
import { setupAccountDatabase } from '#tests/helpers/account_database'

const password = 'NotesPass123!'

test.group('notes in the browser', (group) => {
  group.each.setup(async () => {
    const cleanup = await setupAccountDatabase()
    await limiter.clear(['memory'])
    return cleanup
  })

  test('the retry form submits one note and displays the replay result', async ({
    visit,
    assert,
  }) => {
    const user = await User.create({ email: 'notes@example.test', password })
    const page = await visit('/login')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('heading', { name: 'Your dashboard is ready' }).waitFor()

    await page.getByRole('link', { name: 'Notes' }).click()
    await page.getByRole('heading', { name: 'Retry safe notes' }).waitFor()
    await page.getByLabel('Note').fill('Remember the meeting')
    await page.getByRole('button', { name: 'Create and retry' }).click()
    await page.getByText(/retry returned the same result/).waitFor()

    const rows = await db.from('notes').where('user_id', user.id).select('body')
    assert.deepEqual(rows, [{ body: 'Remember the meeting' }])
    assert.equal(await page.locator('[data-note-id]').count(), 1)
    const receiptCount = await db.from('request_receipts').count('* as total')
    assert.equal(receiptCount[0].total, 1)
  })
})
