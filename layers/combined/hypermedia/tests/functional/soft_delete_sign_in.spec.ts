import { test } from '@japa/runner'
import limiter from '@adonisjs/limiter/services/main'
import User from '#models/user'
import { masqueradeOperatorEmails } from '#services/masquerade_operators'
import { setupAccountDatabase } from '#tests/helpers/account_database'
import { FormSession } from '#tests/helpers/form_session'

const password = 'CombinedPass123!'

test.group('account kit and masquerade with soft delete', (group) => {
  group.each.setup(async () => {
    const cleanup = await setupAccountDatabase()
    await limiter.clear(['memory'])
    return async () => {
      masqueradeOperatorEmails.clear()
      await cleanup()
    }
  })

  test('a soft-deleted account cannot sign in or be masqueraded as', async ({ assert }) => {
    masqueradeOperatorEmails.add('operator@example.test')
    const operator = await User.create({ email: 'operator@example.test', password })
    const member = await User.create({ email: 'member@example.test', password })
    await new FormSession().login(member.email, password)

    await member.delete()
    await assert.rejects(() => new FormSession().login(member.email, password))

    const session = new FormSession()
    await session.login(operator.email, password)
    await session.request('/masquerade/accounts')
    assert.notInclude(session.html, 'member@example.test')
    const started = await session.request('/masquerade/start', {
      _masqueradeContext: session.field('_masqueradeContext') ?? '',
      targetId: String(member.id),
      access: 'view',
    })
    assert.notEqual(started.headers.get('location'), '/dashboard')
    await session.request('/dashboard')
    assert.include(session.html, 'Signed in as <strong>operator@example.test</strong>')
  })
})
