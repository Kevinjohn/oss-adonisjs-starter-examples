import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import emitter from '@adonisjs/core/services/emitter'
import { SessionCollection } from '@adonisjs/session'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import { setupAccountDatabase } from '#tests/helpers/account_database'
import { FormSession } from '#tests/helpers/form_session'

test.group('browser session', (group) => {
  async function requestWithSession(request: () => Promise<Response>) {
    let sessionId: string | undefined
    const unsubscribe = emitter.on('session:committed', ({ session }) => {
      sessionId = session.sessionId
    })
    try {
      const response = await request()
      if (!sessionId) throw new Error('Expected the HTTP request to commit a session')
      return { response, sessionId }
    } finally {
      unsubscribe()
    }
  }

  group.each.setup(setupAccountDatabase)

  test('a stale credential clears the registry sign-in and the browser session', async ({
    assert,
  }) => {
    const password = 'BrowserPass123!'
    const user = await User.create({ email: 'reader@example.test', password })
    const browser = new FormSession()
    await browser.login(user.email, password)
    const { response: dashboard, sessionId: staleId } = await requestWithSession(() =>
      browser.request('/dashboard')
    )
    assert.equal(dashboard.status, 200)

    const sessions = await app.container.make(SessionCollection)
    assert.exists(await sessions.get(staleId))
    const signIn = await db.from('account_sessions').where('user_id', user.id).first()
    assert.exists(signIn)
    // Simulate an older revision with its registry row still present.
    await db.from('users').where('id', user.id).update({
      credentials_changed_at: '2025-01-01T00:00:00.000Z',
    })

    const { response: refused, sessionId: renewedId } = await requestWithSession(() =>
      browser.request('/dashboard')
    )
    assert.equal(refused.status, 302)
    assert.equal(refused.headers.get('location'), '/login')
    assert.notEqual(renewedId, staleId)
    assert.isNull(await sessions.get(staleId))
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
