import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import User from '#models/user'
import { softDeleteAdminEmails } from '#services/soft_delete_admins'
import { truncateDatabase } from '#tests/helpers/database'

// Lucid Soft Delete's example spec, on Account Kit's test database and sign-in.
const password = 'SoftDeletePass123!'

function createUser(email: string) {
  return User.create({ email, password, emailVerifiedAt: DateTime.utc() })
}

test.group('soft delete', (group) => {
  group.each.setup(async () => {
    const cleanup = await truncateDatabase()
    softDeleteAdminEmails.add('admin@example.test')
    return async () => {
      softDeleteAdminEmails.clear()
      await cleanup()
    }
  })

  test('an account deletes itself and an administrator restores it', async ({ client, assert }) => {
    const admin = await createUser('admin@example.test')
    const member = await createUser('member@example.test')

    const deleted = await client.delete('/api/v1/account').loginAs(member)
    deleted.assertStatus(204)
    assert.isNull(await User.find(member.id))

    const refusedLogin = await client
      .post('/api/v1/auth/login')
      .json({ email: member.email, password })
    refusedLogin.assertStatus(401)

    const listed = await client.get('/api/v1/admin/deleted-users').loginAs(admin)
    listed.assertStatus(200)
    assert.deepEqual(
      listed.body().map((user: { email: string }) => user.email),
      ['member@example.test']
    )

    const restored = await client
      .post(`/api/v1/admin/deleted-users/${member.id}/restore`)
      .loginAs(admin)
    restored.assertStatus(200)
    const login = await client.post('/api/v1/auth/login').json({ email: member.email, password })
    login.assertStatus(200)
  })

  test('a non-administrator and a guest cannot list or restore', async ({ client, assert }) => {
    const member = await createUser('member@example.test')
    const deleted = await createUser('deleted@example.test')
    await deleted.delete()

    const listed = await client.get('/api/v1/admin/deleted-users').loginAs(member)
    listed.assertStatus(403)
    const restored = await client
      .post(`/api/v1/admin/deleted-users/${deleted.id}/restore`)
      .loginAs(member)
    restored.assertStatus(403)
    assert.isNull(await User.find(deleted.id))

    const guestList = await client.get('/api/v1/admin/deleted-users')
    guestList.assertStatus(401)
    const guestDelete = await client.delete('/api/v1/account')
    guestDelete.assertStatus(401)
  })
})
