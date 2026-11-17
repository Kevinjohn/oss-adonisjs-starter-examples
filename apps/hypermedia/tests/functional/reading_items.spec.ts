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
    const item = await ReadingItem.query().where('user_id', user.id).firstOrFail()
    assert.equal(item.title, 'Lucid guide')
    assert.deepEqual(item.labels, ['reference'])
    const page = await browser.request('/reading-items')
    assert.include(browser.html, 'Lucid guide')
    assert.equal(page.status, 200)
  })

  test('invalid persisted labels fail model hydration and render a safe server error', async ({
    assert,
  }) => {
    const user = await User.create({ email: 'reader@example.test', password: 'password123' })
    const [id] = await db.table('reading_items').insert({
      user_id: user.id,
      title: 'Bad row',
      labels: '["unknown"]',
    })
    await assert.rejects(
      () => ReadingItem.findOrFail(id),
      /Invalid persisted JSON in reading_items.labels/
    )
    const browser = new FormSession()
    await browser.login(user.email, 'password123')
    const response = await browser.request('/reading-items')
    assert.equal(response.status, 500)
    const errorBody = await response.text()
    assert.equal(errorBody, 'Reading list unavailable')
    assert.notInclude(errorBody, 'Invalid persisted JSON in reading_items.labels')
  })
})
