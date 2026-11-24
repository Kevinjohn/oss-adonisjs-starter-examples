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

    const other = await User.create({ email: 'other@example.test', password: 'password123' })
    await ReadingItem.create({ userId: other.id, title: 'Another list', labels: ['personal'] })

    const listed = await client.get('/api/v1/account/reading-items').bearerToken(bearer)
    assert.equal(listed.status(), 200)
    const items = responseBody<{ items: { title: string; labels: string[] }[] }>(listed).items
    assert.lengthOf(items, 1)
    assert.deepInclude(items[0], { title: 'Lucid guide', labels: ['reference'] })
  })

  test('an existing bearer token cannot access reading items after the account is disabled', async ({
    client,
    assert,
  }) => {
    const user = await User.create({
      email: 'disabled-reader@example.test',
      password: 'password123',
    })
    const token = await User.accessTokens.create(user)
    const bearer = token.value!.release()
    const created = await client
      .post('/api/v1/account/reading-items')
      .bearerToken(bearer)
      .json({ title: 'Before restriction', labels: ['reference'] })
    assert.equal(created.status(), 201)
    await db.table('role_assignments').insert({ user_id: user.id, role: 'disabled' })
    const listed = await client.get('/api/v1/account/reading-items').bearerToken(bearer)
    const refused = await client
      .post('/api/v1/account/reading-items')
      .bearerToken(bearer)
      .json({ title: 'After restriction', labels: ['reference'] })
    assert.equal(listed.status(), 401)
    assert.equal(refused.status(), 401)
    const rows = await db.from('reading_items').where('user_id', user.id)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].title, 'Before restriction')
  })

  for (const [kind, labels] of [
    ['Malformed JSON', '["work"'],
    ['Disallowed', '["unknown"]'],
    ['Object', '{"label":"work"}'],
    ['JSON null', 'null'],
  ]) {
    test(`${kind} labels fail model hydration and return a safe server error`, async ({
      client,
      assert,
    }) => {
      const user = await User.create({ email: 'reader@example.test', password: 'password123' })
      const [{ id }] = await db
        .table('reading_items')
        .insert({
          user_id: user.id,
          title: 'Bad row',
          labels,
        })
        .returning('id')
      await assert.rejects(
        () => ReadingItem.findOrFail(id),
        /Invalid persisted JSON in reading_items.labels/
      )
      const token = await User.accessTokens.create(user)
      const response = await client
        .get('/api/v1/account/reading-items')
        .bearerToken(token.value!.release())
      assert.equal(response.status(), 500)
      assert.deepEqual(response.body(), { message: 'Reading list unavailable' })
      assert.notInclude(response.text(), 'Invalid persisted JSON in reading_items.labels')
    })
  }
})
