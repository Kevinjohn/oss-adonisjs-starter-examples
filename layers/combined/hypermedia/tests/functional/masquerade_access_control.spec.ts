import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import { transaction } from '@kevinjohn/adonisjs-account-kit/transaction'
import accessControl from '#config/access_control'
import Team from '#models/team'
import User from '#models/user'
import { masqueradeOperatorEmails } from '#services/masquerade_operators'
import { setupAccountDatabase } from '#tests/helpers/account_database'
import { FormSession } from '#tests/helpers/form_session'

const password = 'CombinedPass123!'

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

/** Starts an editable masquerade as `target` from the operator page. */
async function actAs(session: FormSession, target: User) {
  await session.request('/masquerade/accounts')
  const started = await session.request('/masquerade/start', {
    _masqueradeContext: session.field('_masqueradeContext') ?? '',
    targetId: String(target.id),
    access: 'edit',
  })
  if (started.headers.get('location') !== '/dashboard') throw new Error('Masquerade did not start')
  await session.request('/dashboard')
}

/** Ends the masquerade from the operator page. */
async function stop(session: FormSession) {
  await session.request('/masquerade/accounts')
  await session.request('/masquerade/stop', {
    _masqueradeContext: session.field('_masqueradeContext') ?? '',
  })
}

/** Submits the rename form, asking for JSON:API so a refusal carries its code. */
async function rename(session: FormSession, teamId: number, name: string) {
  await session.request(`/teams/${teamId}`)
  return session.request(`/teams/${teamId}`, { name }, 'application/vnd.api+json')
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
    const session = new FormSession()
    await session.login(operator.email, password)

    await actAs(session, viewer)
    assert.include(session.html, 'Signed in as <strong>viewer@example.test</strong>')
    const refused = await rename(session, team.id, 'Viewer was here')
    assert.equal(refused.status, 403)
    const refusal = (await refused.json()) as { errors: Array<{ code: string }> }
    assert.equal(refusal.errors[0].code, 'E_AUTHORIZATION_FAILURE')
    assert.equal(await teamName(team.id), 'Rockets')
    await stop(session)

    await actAs(session, editor)
    assert.include(session.html, 'Signed in as <strong>editor@example.test</strong>')
    const renamed = await rename(session, team.id, 'Comets')
    assert.equal(renamed.headers.get('location'), `/teams/${team.id}`)
    assert.equal(await teamName(team.id), 'Comets')
    await stop(session)

    await session.request('/dashboard')
    assert.include(session.html, 'Signed in as <strong>operator@example.test</strong>')
    const outside = await session.request(`/teams/${team.id}`, undefined, 'application/json')
    assert.equal(outside.status, 403)
    const forbidden = (await outside.json()) as { errors: Array<{ code: string }> }
    assert.equal(forbidden.errors[0].code, 'E_ACCESS_CONTROL_FORBIDDEN')
  })
})
