import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import User from '#models/user'
import { truncateDatabase } from '#tests/helpers/database'

const password = 'CombinedPass123!'

test.group('account kit with soft delete', (group) => {
  group.each.setup(truncateDatabase)

  test('a soft-deleted account cannot sign in through Account Kit', async ({ client, assert }) => {
    const member = await User.create({
      email: 'member@example.test',
      password,
      emailVerifiedAt: DateTime.utc(),
    })
    const before = await client.post('/api/v1/auth/login').json({ email: member.email, password })
    assert.equal(before.status(), 200)

    await member.delete()
    const after = await client.post('/api/v1/auth/login').json({ email: member.email, password })
    assert.notEqual(after.status(), 200)
    assert.notProperty(after.body() as object, 'token')
    const stored = await User.withTrashed().where('id', member.id).firstOrFail()
    assert.isTrue(stored.trashed)
  })
})
