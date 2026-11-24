import { rejects } from 'node:assert/strict'
import { errors } from '@kevinjohn/adonisjs-lucid-checked-columns'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import ReadingItem from '#models/reading_item'
import { setupAccountDatabase } from '#tests/helpers/account_database'
import { FormSession } from '#tests/helpers/form_session'

test.group('reading items', (group) => {
  group.each.setup(setupAccountDatabase)

  test('a signed-in account creates and reads its checked label', async ({ assert }) => {
    await User.create({ email: 'reader@example.test', password: 'password123' })
    const browser = new FormSession()
    await browser.login('reader@example.test', 'password123')
    await browser.request('/reading-items')
    const created = await browser.request('/reading-items', {
      title: 'Lucid guide',
      label: 'reference',
    })
    assert.equal(created.headers.get('location'), '/reading-items')
    const user = await User.findByOrFail('email', 'reader@example.test')
    const item = await ReadingItem.query()
      .withScopes((scopes) => scopes.forOwner(user.id))
      .firstOrFail()
    assert.equal(item.title, 'Lucid guide')
    assert.deepEqual(item.labels, ['reference'])
    const other = await User.create({ email: 'other@example.test', password: 'password123' })
    await ReadingItem.create({ userId: other.id, title: 'Another list', labels: ['personal'] })
    const page = await browser.request('/reading-items')
    assert.include(browser.html, 'Lucid guide')
    assert.notInclude(browser.html, 'Another list')
    assert.equal(page.status, 200)
  })

  for (const [kind, labels] of [
    ['Malformed JSON', '["work"'],
    ['Disallowed', '["unknown"]'],
    ['Object', '{"label":"work"}'],
    ['JSON null', 'null'],
  ]) {
    test(`${kind} labels fail model hydration and render a safe server error`, async ({
      assert,
    }) => {
      const user = await User.create({ email: 'reader@example.test', password: 'password123' })
      const id = 101
      await db.table('reading_items').insert({
        id,
        user_id: user.id,
        title: 'Bad row',
        labels,
      })
      await rejects(
        () => ReadingItem.findOrFail(id),
        (error: unknown) =>
          error instanceof errors.E_INVALID_PERSISTED_JSON &&
          error.table === 'reading_items' &&
          error.column === 'labels'
      )
      const browser = new FormSession()
      await browser.login(user.email, 'password123')
      const response = await browser.request('/reading-items')
      assert.equal(response.status, 500)
      const errorBody = await response.text()
      assert.equal(errorBody, 'Reading list unavailable')
      assert.notInclude(errorBody, 'Invalid persisted JSON in reading_items.labels')
    })
  }
})
