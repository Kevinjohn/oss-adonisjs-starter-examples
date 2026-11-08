import assert from 'node:assert/strict'
import { test } from '@japa/runner'
import limiter from '@adonisjs/limiter/services/main'
import Team from '#models/team'
import User from '#models/user'
import { accountKitNotifications } from '#services/account_kit_notifications'
import { masqueradeOperatorEmails } from '#services/masquerade_operators'
import { setupAccountDatabase } from '#tests/helpers/account_database'
import { FormSession } from '#tests/helpers/form_session'

const password = 'CombinedPass123!'

async function createActingSession(access: 'view' | 'edit') {
  masqueradeOperatorEmails.add('operator@example.test')
  const actor = await User.create({ email: 'operator@example.test', password })
  const target = await User.create({ email: 'target@example.test', password })
  const session = new FormSession()
  await session.login(actor.email, password)
  await startMasquerade(session, target, access)
  return { actor, target, session }
}

async function startMasquerade(session: FormSession, target: User, access: 'view' | 'edit') {
  await session.request('/masquerade/accounts')
  const started = await session.request('/masquerade/start', {
    _masqueradeContext: session.field('_masqueradeContext') ?? '',
    targetId: String(target.id),
    access,
  })
  assert.equal(started.headers.get('location'), '/dashboard')
}

async function createInvitation(session: FormSession) {
  await session.request('/teams')
  const created = await session.request('/teams', { name: 'Rockets' })
  const teamId = Number(created.headers.get('location')!.split('/').at(-1))
  await session.request(`/teams/${teamId}`)
  await session.request(`/teams/${teamId}/invitations`, {
    email: 'new-member@example.test',
    role: 'viewer',
  })
  return {
    teamId,
    token: accountKitNotifications.tokenFor('invitationProvision', 'new-member@example.test'),
  }
}

async function assertBlocked(response: Response) {
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), {
    errors: [
      {
        code: 'E_MASQUERADE_ACTION_BLOCKED',
        message: 'Action is blocked while masquerading',
        blockedBy: 'sensitive',
      },
    ],
  })
}

test.group('Masquerade blocks actor-owned hypermedia routes', (group) => {
  group.each.setup(async () => {
    const cleanup = await setupAccountDatabase()
    await limiter.clear(['memory'])
    accountKitNotifications.clear()
    const originalOperators = [...masqueradeOperatorEmails]
    masqueradeOperatorEmails.clear()
    return async () => {
      masqueradeOperatorEmails.clear()
      for (const email of originalOperators) masqueradeOperatorEmails.add(email)
      await cleanup()
    }
  })

  test('blocks the account deletion form in view mode', async () => {
    const { actor, target, session } = await createActingSession('view')
    await assertBlocked(
      await session.request('/account/delete', undefined, 'application/vnd.api+json')
    )
    assert.ok(await User.find(actor.id))
    assert.ok(await User.find(target.id))
  })

  test('blocks account deletion in view mode', async () => {
    const { actor, target, session } = await createActingSession('view')
    await assertBlocked(await session.request('/account/delete', {}, 'application/vnd.api+json'))
    assert.ok(await User.find(actor.id))
    assert.ok(await User.find(target.id))
  })

  test('blocks the actor team list in view mode', async () => {
    const { actor, target, session } = await createActingSession('view')
    await assertBlocked(await session.request('/teams', undefined, 'application/vnd.api+json'))
    assert.ok(await User.find(actor.id))
    assert.ok(await User.find(target.id))
  })

  test('blocks team creation in edit mode', async () => {
    const { actor, target, session } = await createActingSession('edit')
    await assertBlocked(
      await session.request('/teams', { name: 'Should not exist' }, 'application/vnd.api+json')
    )
    const teams = await Team.all()
    assert.equal(teams.length, 0)
    assert.ok(await User.find(actor.id))
    assert.ok(await User.find(target.id))
  })

  test('blocks invitation inspection in view mode', async () => {
    masqueradeOperatorEmails.add('operator@example.test')
    const actor = await User.create({ email: 'operator@example.test', password })
    const target = await User.create({ email: 'target@example.test', password })
    const session = new FormSession()
    await session.login(actor.email, password)
    const { token } = await createInvitation(session)
    await session.request('/masquerade/accounts')
    const started = await session.request('/masquerade/start', {
      _masqueradeContext: session.field('_masqueradeContext') ?? '',
      targetId: String(target.id),
      access: 'view',
    })
    assert.equal(started.headers.get('location'), '/dashboard')

    await assertBlocked(
      await session.request(
        `/invitation/${encodeURIComponent(token)}`,
        undefined,
        'application/vnd.api+json'
      )
    )
    assert.ok(await User.find(actor.id))
    assert.ok(await User.find(target.id))
  })

  test('blocks invitation acceptance in view mode', async () => {
    masqueradeOperatorEmails.add('operator@example.test')
    const actor = await User.create({ email: 'operator@example.test', password })
    const target = await User.create({ email: 'target@example.test', password })
    const session = new FormSession()
    await session.login(actor.email, password)
    const { token } = await createInvitation(session)
    await session.request('/masquerade/accounts')
    const started = await session.request('/masquerade/start', {
      _masqueradeContext: session.field('_masqueradeContext') ?? '',
      targetId: String(target.id),
      access: 'view',
    })
    assert.equal(started.headers.get('location'), '/dashboard')

    await assertBlocked(
      await session.request(
        `/invitation/${encodeURIComponent(token)}`,
        { password, passwordConfirmation: password },
        'application/vnd.api+json'
      )
    )
    assert.equal(await User.findBy('email', 'new-member@example.test'), null)
    assert.ok(await User.find(actor.id))
    assert.ok(await User.find(target.id))
  })

  test('blocks team invitation in edit mode', async () => {
    masqueradeOperatorEmails.add('operator@example.test')
    const actor = await User.create({ email: 'operator@example.test', password })
    const target = await User.create({ email: 'target@example.test', password })
    const session = new FormSession()
    await session.login(actor.email, password)
    await session.request('/teams')
    const created = await session.request('/teams', { name: 'Rockets' })
    const teamId = Number(created.headers.get('location')!.split('/').at(-1))
    await startMasquerade(session, target, 'edit')

    await assertBlocked(
      await session.request(
        `/teams/${teamId}/invitations`,
        { email: 'friend@example.test', role: 'viewer' },
        'application/vnd.api+json'
      )
    )
    assert.equal(
      accountKitNotifications.last('invitationProvision', 'friend@example.test'),
      undefined
    )
    assert.ok(await User.find(actor.id))
    assert.ok(await User.find(target.id))
  })
})
