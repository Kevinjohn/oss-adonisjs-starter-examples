import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import { transaction } from '@kevinjohn/adonisjs-account-kit/transaction'
import accessControl from '#config/access_control'
import Team from '#models/team'
import User from '#models/user'
import { masqueradeOperatorEmails } from '#services/masquerade_operators'
import { grantAdmission } from '#tests/helpers/admission'
import { responseBody } from '#tests/helpers/response_body'
import { truncateDatabase } from '#tests/helpers/database'

const password = 'CombinedPass123!'

type ModeView = { isMasquerading: boolean; contextToken: string }

async function createAdmittedUser(email: string) {
  const user = await User.create({
    fullName: email.split('@')[0],
    email,
    password,
    emailVerifiedAt: DateTime.utc(),
  })
  await grantAdmission(user)
  return user
}

async function login(client: ApiClient, email: string) {
  const response = await client.post('/api/v1/auth/login').json({ email, password })
  response.assertStatus(200)
  return responseBody<{ data: { token: string } }>(response).data.token
}

async function mode(client: ApiClient, actorToken: string) {
  const response = await client.get('/masquerade').bearerToken(actorToken)
  response.assertStatus(200)
  return responseBody<ModeView>(response)
}

async function start(client: ApiClient, actorToken: string, contextToken: string, target: User) {
  return client
    .post('/masquerade/start')
    .bearerToken(actorToken)
    .header('X-Masquerade-Context', contextToken)
    .json({ targetId: String(target.id), access: 'edit' })
}

async function stop(client: ApiClient, actorToken: string, contextToken: string) {
  return client
    .post('/masquerade/stop')
    .bearerToken(actorToken)
    .header('X-Masquerade-Context', contextToken)
}

async function createOwnedTeam(owner: User) {
  return transaction(db, async (trx) => {
    const created = await Team.create({ name: 'Rockets' }, { client: trx })
    await accessControl.memberships.createFirstMember({
      scopeId: created.id,
      userId: owner.id,
      trx,
    })
    return created
  })
}

test.group('masquerade with access control', (group) => {
  group.each.setup(truncateDatabase)
  group.each.setup(async () => {
    const originalOperators = [...masqueradeOperatorEmails]
    masqueradeOperatorEmails.clear()
    return () => {
      masqueradeOperatorEmails.clear()
      for (const email of originalOperators) masqueradeOperatorEmails.add(email)
    }
  })

  test('effective membership controls team reads and edits, then restores the outsider operator', async ({
    client,
    assert,
  }) => {
    const operator = await createAdmittedUser('operator@example.test')
    const owner = await createAdmittedUser('owner@example.test')
    const viewer = await createAdmittedUser('viewer@example.test')
    const editor = await createAdmittedUser('editor@example.test')
    masqueradeOperatorEmails.add(operator.email)

    const team = await transaction(db, async (trx) => {
      const created = await Team.create({ name: 'Rockets' }, { client: trx })
      await accessControl.memberships.createFirstMember({
        scopeId: created.id,
        userId: owner.id,
        trx,
      })
      await accessControl.memberships.grant({
        scopeId: created.id,
        userId: viewer.id,
        role: 'viewer',
        trx,
      })
      await accessControl.memberships.grant({
        scopeId: created.id,
        userId: editor.id,
        role: 'editor',
        trx,
      })
      return created
    })

    const actorToken = await login(client, operator.email)
    const initialMode = await mode(client, actorToken)
    assert.isFalse(initialMode.isMasquerading)
    const viewerStarted = await start(client, actorToken, initialMode.contextToken, viewer)
    assert.equal(viewerStarted.status(), 200)
    const viewerMode = await mode(client, actorToken)
    assert.isTrue(viewerMode.isMasquerading)

    const readAsViewer = await client
      .get(`/api/v1/teams/${team.id}`)
      .bearerToken(actorToken)
      .header('X-Masquerade-Context', viewerMode.contextToken)
    assert.equal(readAsViewer.status(), 200)
    assert.equal(
      responseBody<{ membership: { role: string } }>(readAsViewer).membership.role,
      'viewer'
    )

    const refusedRename = await client
      .patch(`/api/v1/teams/${team.id}`)
      .bearerToken(actorToken)
      .header('X-Masquerade-Context', viewerMode.contextToken)
      .header('accept', 'application/vnd.api+json')
      .json({ name: 'Viewer was here' })
    assert.equal(refusedRename.status(), 403)
    assert.equal(
      responseBody<{ errors: Array<{ code: string }> }>(refusedRename).errors[0].code,
      'E_AUTHORIZATION_FAILURE'
    )
    const teamAfterRefusal = await Team.findOrFail(team.id)
    assert.equal(teamAfterRefusal.name, 'Rockets')

    const viewerStopped = await stop(client, actorToken, viewerMode.contextToken)
    assert.equal(viewerStopped.status(), 200)

    const editorStartMode = await mode(client, actorToken)
    const editorStarted = await start(client, actorToken, editorStartMode.contextToken, editor)
    assert.equal(editorStarted.status(), 200)
    const editorMode = await mode(client, actorToken)
    const renamed = await client
      .patch(`/api/v1/teams/${team.id}`)
      .bearerToken(actorToken)
      .header('X-Masquerade-Context', editorMode.contextToken)
      .json({ name: 'Comets' })
    assert.equal(renamed.status(), 200)
    const renamedTeam = await Team.findOrFail(team.id)
    assert.equal(renamedTeam.name, 'Comets')

    const editorStopped = await stop(client, actorToken, editorMode.contextToken)
    assert.equal(editorStopped.status(), 200)
    const restoredMode = await mode(client, actorToken)
    assert.isFalse(restoredMode.isMasquerading)

    const restoredAccount = await client.get('/api/v1/masquerade/account').bearerToken(actorToken)
    assert.equal(restoredAccount.status(), 200)
    assert.deepEqual(restoredAccount.body(), { id: operator.id, email: operator.email })

    const refusedOutsider = await client.get(`/api/v1/teams/${team.id}`).bearerToken(actorToken)
    assert.equal(refusedOutsider.status(), 403)
    assert.equal(
      responseBody<{ errors: Array<{ code: string }> }>(refusedOutsider).errors[0].code,
      'E_ACCESS_CONTROL_FORBIDDEN'
    )
  })

  test('revoked actor admission leaves the active mode untouched before target invalidation', async ({
    client,
    assert,
  }) => {
    const actor = await createAdmittedUser('operator@example.test')
    const target = await createAdmittedUser('target@example.test')
    masqueradeOperatorEmails.add(actor.email)
    const team = await createOwnedTeam(target)

    const actorToken = await login(client, actor.email)
    const initialMode = await mode(client, actorToken)
    const started = await start(client, actorToken, initialMode.contextToken, target)
    assert.equal(started.status(), 200)
    const activeMode = await mode(client, actorToken)
    assert.isTrue(activeMode.isMasquerading)

    const effectiveRead = await client
      .get(`/api/v1/teams/${team.id}`)
      .bearerToken(actorToken)
      .header('X-Masquerade-Context', activeMode.contextToken)
    assert.equal(effectiveRead.status(), 200)
    assert.equal(responseBody<{ name: string }>(effectiveRead).name, 'Rockets')

    const activeBeforeRevocation = await db
      .from('masquerade_modes')
      .where('actor_id', String(actor.id))
      .where('state', 'active')
      .first()
    if (!activeBeforeRevocation) throw new Error('Expected an active masquerade mode')
    await db
      .from('account_admissions')
      .where('user_id', actor.id)
      .update({ approval_status: 'revoked' })
    await target.delete()

    const refused = await client
      .get(`/api/v1/teams/${team.id}`)
      .bearerToken(actorToken)
      .header('X-Masquerade-Context', activeMode.contextToken)
    assert.equal(refused.status(), 403)
    assert.equal(
      responseBody<{ errors: Array<{ code: string }> }>(refused).errors[0].code,
      'E_ACCOUNT_KIT_ADMISSION_REQUIRED'
    )

    const activeAfterRevocation = await db
      .from('masquerade_modes')
      .where('actor_id', String(actor.id))
      .where('state', 'active')
      .first()
    if (!activeAfterRevocation) throw new Error('Expected the active masquerade mode to remain')
    assert.deepEqual(activeAfterRevocation, activeBeforeRevocation)
  })
})
