import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import { setupAccountDatabase } from '#tests/helpers/account_database'
import { InertiaSession } from '#tests/helpers/inertia_session'

test.group('browser session', (group) => {
  group.each.setup(setupAccountDatabase)

  test('a stale credential clears the registry sign-in and the browser session', async ({
    assert,
  }) => {
    const password = 'BrowserPass123!'
    const user = await User.create({ email: 'reader@example.test', password })
    const browser = new InertiaSession()
    await browser.login(user.email, password)
    const dashboard = await browser.request('/dashboard')
    assert.equal(dashboard.status, 200)

    const sessions = await db.from('sessions').select('id')
    assert.isNotEmpty(sessions)
    const signIn = await db.from('account_sessions').where('user_id', user.id).first()
    assert.exists(signIn)
    // Simulate an older revision with its registry row still present.
    await db.from('users').where('id', user.id).update({
      credentials_changed_at: '2025-01-01T00:00:00.000Z',
    })

    const refused = await browser.request('/dashboard')
    assert.equal(refused.status, 302)
    assert.equal(refused.headers.get('location'), '/login')
    assert.isEmpty(
      await db.from('sessions').whereIn(
        'id',
        sessions.map((row) => row.id)
      )
    )
    assert.isEmpty(await db.from('account_sessions').where('user_id', user.id))

    await browser.login(user.email, password)
    const recovered = await browser.request('/dashboard')
    assert.equal(recovered.status, 200)
    const signedOut = await browser.request('/logout', {})
    assert.equal(signedOut.status, 302)
    assert.equal(signedOut.headers.get('location'), '/login')
    assert.isEmpty(await db.from('account_sessions').where('user_id', user.id))
  })
})
