import assert from 'node:assert/strict'
import { test } from '@japa/runner'
import limiter from '@adonisjs/limiter/services/main'
import Team from '#models/team'
import User from '#models/user'
import { notifyOverrides } from '../../config/account_kit.js'
import { masqueradeOperatorEmails } from '#services/masquerade_operators'
import { setupAccountDatabase } from '../helpers/account_database.js'
import { InertiaSession } from '../helpers/inertia_session.js'

const password = 'CombinedPass123!'
const invitationUrls = new Map<string, string>()

type AccountsProps = { mode: { contextToken: string } }

async function createActingSession(access: 'view' | 'edit') {
  masqueradeOperatorEmails.add('operator@example.test')
  const actor = await User.create({ email: 'operator@example.test', password })
  const target = await User.create({ email: 'target@example.test', password })
  const session = new InertiaSession()
  await session.login(actor.email, password)
  await startMasquerade(session, target, access)
  return { actor, target, session }
}

async function startMasquerade(session: InertiaSession, target: User, access: 'view' | 'edit') {
  const page = await session.props<AccountsProps>('/masquerade/accounts')
  const started = await session.request('/masquerade/start', {
    _masqueradeContext: page.mode.contextToken,
    targetId: String(target.id),
    access,
  })
  assert.equal(started.headers.get('location'), '/dashboard')
}

async function createInvitation(session: InertiaSession) {
  await session.props('/teams')
  const created = await session.request('/teams', { name: 'Rockets' })
  const teamId = Number(created.headers.get('location')!.split('/').at(-1))
  await session.props(`/teams/${teamId}`)
  await session.request(`/teams/${teamId}/invitations`, {
    email: 'new-member@example.test',
    role: 'viewer',
  })
  const url = invitationUrls.get('new-member@example.test')
  if (!url) throw new Error('Team invitation did not produce a link')
  return { teamId, path: new URL(url).pathname }
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

test.group('Masquerade blocks actor-owned Inertia routes', (group) => {
  group.each.setup(async () => {
    const cleanup = await setupAccountDatabase()
    await limiter.clear(['memory'])
    invitationUrls.clear()
    const originalNotify = notifyOverrides.invitationProvision
    notifyOverrides.invitationProvision = async (invitation, url) => {
      invitationUrls.set(invitation.email, url)
    }
    const originalOperators = [...masqueradeOperatorEmails]
    masqueradeOperatorEmails.clear()
    return async () => {
      notifyOverrides.invitationProvision = originalNotify
      masqueradeOperatorEmails.clear()
      for (const email of originalOperators) masqueradeOperatorEmails.add(email)
      await cleanup()
    }
  })

  test('blocks the account deletion form in view mode', async () => {
    const { actor, target, session } = await createActingSession('view')
    await assertBlocked(await session.request('/account/delete'))
    assert.ok(await User.find(actor.id))
    assert.ok(await User.find(target.id))
  })

  test('blocks account deletion in view mode', async () => {
    const { actor, target, session } = await createActingSession('view')
    await assertBlocked(await session.request('/account/delete', {}))
    assert.ok(await User.find(actor.id))
    assert.ok(await User.find(target.id))
  })

  test('blocks the actor team list in view mode', async () => {
    const { actor, target, session } = await createActingSession('view')
    await assertBlocked(await session.request('/teams'))
    assert.ok(await User.find(actor.id))
    assert.ok(await User.find(target.id))
  })

  test('blocks team creation in edit mode', async () => {
    const { actor, target, session } = await createActingSession('edit')
    await assertBlocked(await session.request('/teams', { name: 'Should not exist' }))
    const teams = await Team.all()
    assert.equal(teams.length, 0)
    assert.ok(await User.find(actor.id))
    assert.ok(await User.find(target.id))
  })

  test('blocks invitation inspection in view mode', async () => {
    masqueradeOperatorEmails.add('operator@example.test')
    const actor = await User.create({ email: 'operator@example.test', password })
    const target = await User.create({ email: 'target@example.test', password })
    const session = new InertiaSession()
    await session.login(actor.email, password)
    const { path } = await createInvitation(session)
    await startMasquerade(session, target, 'view')

    await assertBlocked(await session.request(path))
    assert.ok(await User.find(actor.id))
    assert.ok(await User.find(target.id))
  })

  test('blocks invitation acceptance in view mode', async () => {
    masqueradeOperatorEmails.add('operator@example.test')
    const actor = await User.create({ email: 'operator@example.test', password })
    const target = await User.create({ email: 'target@example.test', password })
    const session = new InertiaSession()
    await session.login(actor.email, password)
    const { path } = await createInvitation(session)
    await startMasquerade(session, target, 'view')

    await assertBlocked(await session.request(path, { password, passwordConfirmation: password }))
    assert.equal(await User.findBy('email', 'new-member@example.test'), null)
    assert.ok(await User.find(actor.id))
    assert.ok(await User.find(target.id))
  })

  test('blocks team invitation in edit mode', async () => {
    masqueradeOperatorEmails.add('operator@example.test')
    const actor = await User.create({ email: 'operator@example.test', password })
    const target = await User.create({ email: 'target@example.test', password })
    const session = new InertiaSession()
    await session.login(actor.email, password)
    await session.props('/teams')
    const created = await session.request('/teams', { name: 'Rockets' })
    const teamId = Number(created.headers.get('location')!.split('/').at(-1))
    await startMasquerade(session, target, 'edit')

    await assertBlocked(
      await session.request(`/teams/${teamId}/invitations`, {
        email: 'friend@example.test',
        role: 'viewer',
      })
    )
    assert.equal(invitationUrls.has('friend@example.test'), false)
    assert.ok(await User.find(actor.id))
    assert.ok(await User.find(target.id))
  })
})
