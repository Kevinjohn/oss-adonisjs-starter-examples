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

  test('a lost response can be retried without changing or duplicating the note', async ({
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

    const responseReceived = Promise.withResolvers<number>()
    const dropResponse = Promise.withResolvers<void>()
    await page.route(
      '**/notes',
      async (route) => {
        try {
          const response = await route.fetch({ maxRedirects: 0 })
          responseReceived.resolve(response.status())
          await dropResponse.promise
        } catch (error) {
          responseReceived.reject(error)
        } finally {
          await route.abort()
        }
      },
      { times: 1 }
    )

    const draft = page.getByLabel('Note', { exact: true })
    const create = page.getByRole('button', { name: 'Create and retry' })
    const expected = [{ body: 'Remember the meeting' }]
    await draft.fill(expected[0].body)
    try {
      await create.click()
      assert.equal(await responseReceived.promise, 201)
      assert.deepEqual(await db.from('notes').where('user_id', user.id).select('body'), expected)
      assert.isFalse(await draft.isEditable())
      assert.isTrue(await create.isDisabled())
    } finally {
      dropResponse.resolve()
    }

    await page
      .getByRole('status')
      .filter({ hasText: 'The submission could not be confirmed' })
      .waitFor()
    assert.isFalse(await draft.isEditable())
    assert.equal(await draft.inputValue(), expected[0].body)
    await page.getByRole('button', { name: 'Retry submission' }).click()
    await page.getByText(/retry returned the same result/).waitFor()

    assert.deepEqual(await db.from('notes').where('user_id', user.id).select('body'), expected)
    assert.deepEqual(await page.locator('[data-note-id]').allTextContents(), [expected[0].body])
    const receiptCount = await db.from('request_receipts').count('* as total')
    assert.equal(receiptCount[0].total, 1)
    assert.isTrue(await draft.isEditable())
    assert.equal(await draft.inputValue(), '')
  })

  test('a definite rejection allows the draft to be corrected', async ({ visit, assert }) => {
    const user = await User.create({ email: 'notes@example.test', password })
    const page = await visit('/login')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('heading', { name: 'Your dashboard is ready' }).waitFor()

    await page.getByRole('link', { name: 'Notes' }).click()
    await page.getByRole('heading', { name: 'Retry safe notes' }).waitFor()
    await page.route(
      '**/notes',
      (route) => route.fulfill({ status: 413, body: 'Content Too Large' }),
      { times: 1 }
    )

    const draft = page.getByLabel('Note', { exact: true })
    const create = page.getByRole('button', { name: 'Create and retry' })
    await draft.fill('Rejected draft')
    await create.click()
    await page.getByText('The server rejected the note. Edit it and try again.').waitFor()
    assert.isTrue(await draft.isEditable())
    assert.equal(await draft.inputValue(), 'Rejected draft')

    await draft.fill('Corrected note')
    await create.click()
    await page.getByText(/retry returned the same result/).waitFor()
    const rows = await db.from('notes').where('user_id', user.id).select('body')
    assert.deepEqual(rows, [{ body: 'Corrected note' }])
  })
})
