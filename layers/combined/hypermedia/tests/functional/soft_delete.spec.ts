import { test } from '@japa/runner'
import limiter from '@adonisjs/limiter/services/main'
import User from '#models/user'
import { setupAccountDatabase } from '#tests/helpers/account_database'
import { softDeleteAdminEmails } from '#services/soft_delete_admins'
import { FormSession } from '#tests/helpers/form_session'

// Lucid Soft Delete's example spec, on Account Kit's test database.
const password = 'SoftDeletePass123!'

test.group('soft delete', (group) => {
  group.each.setup(async () => {
    const cleanup = await setupAccountDatabase()
    await limiter.clear(['memory'])
    softDeleteAdminEmails.add('admin@example.test')
    return async () => {
      softDeleteAdminEmails.clear()
      await cleanup()
    }
  })

  test('an account deletes itself and an administrator restores it', async ({ assert }) => {
    await User.create({ email: 'admin@example.test', password })
    const member = await User.create({ email: 'member@example.test', password })

    const session = new FormSession()
    await session.login(member.email, password)
    await session.request('/account/delete')
    const deleted = await session.request('/account/delete', {})
    assert.equal(deleted.headers.get('location'), '/login')
    assert.isNull(await User.find(member.id))
    const signedOut = await session.request('/dashboard')
    assert.equal(signedOut.headers.get('location'), '/login')
    await assert.rejects(() => new FormSession().login(member.email, password))

    const admin = new FormSession()
    await admin.login('admin@example.test', password)
    await admin.request('/admin/deleted-users')
    assert.include(admin.html, 'member@example.test')
    const restored = await admin.request(`/admin/deleted-users/${member.id}/restore`, {})
    assert.equal(restored.headers.get('location'), '/admin/deleted-users')
    assert.isNotNull(await User.find(member.id))
    await new FormSession().login(member.email, password)
  })

  test('a non-administrator and a guest cannot list or restore', async ({ assert }) => {
    await User.create({ email: 'member@example.test', password })
    const deleted = await User.create({ email: 'deleted@example.test', password })
    await deleted.delete()

    const member = new FormSession()
    await member.login('member@example.test', password)
    const listed = await member.request('/admin/deleted-users')
    assert.equal(listed.status, 403)
    await member.request('/dashboard')
    const refused = await member.request(`/admin/deleted-users/${deleted.id}/restore`, {})
    assert.equal(refused.status, 403)
    assert.isNull(await User.find(deleted.id))

    const guest = new FormSession()
    const guestList = await guest.request('/admin/deleted-users')
    assert.equal(guestList.headers.get('location'), '/login')
    await guest.request('/login')
    const guestRestore = await guest.request(`/admin/deleted-users/${deleted.id}/restore`, {})
    assert.equal(guestRestore.headers.get('location'), '/login')
    assert.isNull(await User.find(deleted.id))
  })
})
