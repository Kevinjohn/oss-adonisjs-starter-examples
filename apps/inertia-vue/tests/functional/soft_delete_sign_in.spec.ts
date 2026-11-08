import { test } from '@japa/runner'
import limiter from '@adonisjs/limiter/services/main'
import User from '#models/user'
import { masqueradeOperatorEmails } from '#services/masquerade_operators'
import { setupAccountDatabase } from '../helpers/account_database.js'
import { InertiaSession } from '../helpers/inertia_session.js'

const password = 'CombinedPass123!'

type AccountsProps = { mode: { contextToken: string }; accounts: { email: string }[] }

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
    await new InertiaSession().login(member.email, password)

    await member.delete()
    await assert.rejects(() => new InertiaSession().login(member.email, password))

    const session = new InertiaSession()
    await session.login(operator.email, password)
    const page = await session.props<AccountsProps>('/masquerade/accounts')
    assert.notInclude(
      page.accounts.map((account) => account.email),
      'member@example.test'
    )
    const started = await session.request('/masquerade/start', {
      _masqueradeContext: page.mode.contextToken,
      targetId: String(member.id),
      access: 'view',
    })
    assert.notEqual(started.headers.get('location'), '/dashboard')
    const dashboard = await session.props<{ user?: { email: string } }>('/dashboard')
    assert.equal(dashboard.user?.email, 'operator@example.test')
  })
})
