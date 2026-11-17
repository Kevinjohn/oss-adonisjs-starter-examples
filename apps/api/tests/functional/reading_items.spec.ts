import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import ReadingItem from '#models/reading_item'
import { truncateDatabase } from '#tests/helpers/database'
import { responseBody } from '#tests/helpers/response_body'

test.group('reading items', (group) => {
  group.each.setup(truncateDatabase)

  test('a bearer account creates and reads checked labels', async ({ client, assert }) => {
    const user = await User.create({ email: 'reader@example.test', password: 'password123' })
    const token = await User.accessTokens.create(user)
    const bearer = token.value!.release()
    const created = await client
      .post('/api/v1/account/reading-items')
      .bearerToken(bearer)
      .json({ title: 'Lucid guide', labels: ['reference'] })
    assert.equal(created.status(), 201)
    assert.deepEqual(responseBody<{ labels: string[] }>(created).labels, ['reference'])

    const listed = await client.get('/api/v1/account/reading-items').bearerToken(bearer)
    assert.equal(listed.status(), 200)
    const items = responseBody<{ items: { title: string; labels: string[] }[] }>(listed).items
    assert.deepInclude(items[0], { title: 'Lucid guide', labels: ['reference'] })
  })

  test('invalid persisted labels fail model hydration and return a safe server error', async ({
    client,
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
    const token = await User.accessTokens.create(user)
    const response = await client
      .get('/api/v1/account/reading-items')
      .bearerToken(token.value!.release())
    assert.equal(response.status(), 500)
    assert.notInclude(response.text(), 'Invalid persisted JSON in reading_items.labels')
  })
})
