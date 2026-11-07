import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import { transaction } from '@kevinjohn/adonisjs-account-kit/transaction'
import accessControl from '#config/access_control'
import Team from '#models/team'
import User from '#models/user'
import { masqueradeOperatorEmails } from '#services/masquerade_operators'
import { setupAccountDatabase } from '../helpers/account_database.js'
import { InertiaSession } from '../helpers/inertia_session.js'

const password = 'CombinedPass123!'

type AccountsProps = { mode: { contextToken: string } }
type AppProps = { user?: { email: string } }

/** A team with an owner, a viewer and an editor, and an operator who belongs to none of it. */
async function createTeam() {
  masqueradeOperatorEmails.add('operator@example.test')
  const operator = await User.create({ email: 'operator@example.test', password })
  const owner = await User.create({ email: 'owner@example.test', password })
  const viewer = await User.create({ email: 'viewer@example.test', password })
  const editor = await User.create({ email: 'editor@example.test', password })
  const team = await transaction(db, async (trx) => {
    const created = await Team.create({ name: 'Rockets' }, { client: trx })
    await accessControl.memberships.createFirstMember({
      scopeId: created.id,
      userId: owner.id,
      trx,
    })
    for (const [user, role] of [
      [viewer, 'viewer'],
      [editor, 'editor'],
    ] as const) {
      await accessControl.memberships.grant({ scopeId: created.id, userId: user.id, role, trx })
    }
    return created
  })
  return { operator, viewer, editor, team }
}

/** Starts an editable masquerade as `target` and returns the effective account's email. */
async function actAs(session: InertiaSession, target: User) {
  const page = await session.props<AccountsProps>('/masquerade/accounts')
  const started = await session.request('/masquerade/start', {
    _masqueradeContext: page.mode.contextToken,
    targetId: String(target.id),
    access: 'edit',
  })
  if (started.headers.get('location') !== '/dashboard') throw new Error('Masquerade did not start')
  const dashboard = await session.props<AppProps>('/dashboard')
  return dashboard.user?.email
}

/** Ends the masquerade from the operator page. */
async function stop(session: InertiaSession) {
  const page = await session.props<AccountsProps>('/masquerade/accounts')
  await session.request('/masquerade/stop', { _masqueradeContext: page.mode.contextToken })
}

async function teamName(teamId: number) {
  const team = await Team.findOrFail(teamId)
  return team.name
}

test.group('masquerade with access control', (group) => {
  group.each.setup(async () => {
    const cleanup = await setupAccountDatabase()
    await limiter.clear(['memory'])
    return async () => {
      masqueradeOperatorEmails.clear()
      await cleanup()
    }
  })

  test('the team sees the masqueraded account, not the operator', async ({ assert }) => {
    const { operator, viewer, editor, team } = await createTeam()
    const session = new InertiaSession()
    await session.login(operator.email, password)

    assert.equal(await actAs(session, viewer), 'viewer@example.test')
    await session.props(`/teams/${team.id}`)
    // Bouncer's E_AUTHORIZATION_FAILURE answers an Inertia form with a redirect and an error flash.
    const refused = await session.request(`/teams/${team.id}`, { name: 'Viewer was here' })
    assert.equal(refused.status, 302)
    const after = await session.request(`/teams/${team.id}`)
    const page = (await after.json()) as { flash: { error?: string } }
    assert.equal(page.flash.error, 'Access denied')
    assert.equal(await teamName(team.id), 'Rockets')
    await stop(session)

    assert.equal(await actAs(session, editor), 'editor@example.test')
    await session.props(`/teams/${team.id}`)
    const renamed = await session.request(`/teams/${team.id}`, { name: 'Comets' })
    assert.equal(renamed.headers.get('location'), `/teams/${team.id}`)
    assert.equal(await teamName(team.id), 'Comets')
    await stop(session)

    const restored = await session.props<AppProps>('/dashboard')
    assert.equal(restored.user?.email, 'operator@example.test')
    const outside = await session.request(`/teams/${team.id}`)
    assert.equal(outside.status, 403)
    const forbidden = (await outside.json()) as { errors: Array<{ code: string }> }
    assert.equal(forbidden.errors[0].code, 'E_ACCESS_CONTROL_FORBIDDEN')
  })
})
