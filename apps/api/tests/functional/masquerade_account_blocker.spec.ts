import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
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

async function start(
  client: ApiClient,
  actorToken: string,
  contextToken: string,
  target: User,
  access: 'view' | 'edit'
) {
  return client
    .post('/masquerade/start')
    .bearerToken(actorToken)
    .header('X-Masquerade-Context', contextToken)
    .json({ targetId: String(target.id), access })
}

test.group('Masquerade blocks actor-owned API mutations', (group) => {
  group.each.setup(truncateDatabase)
  group.each.setup(async () => {
    const originalOperators = [...masqueradeOperatorEmails]
    masqueradeOperatorEmails.clear()
    return () => {
      masqueradeOperatorEmails.clear()
      for (const email of originalOperators) masqueradeOperatorEmails.add(email)
    }
  })

  test('an actor token without masquerade ability cannot soft-delete the actor in view mode', async ({
    client,
    assert,
  }) => {
    const actor = await createAdmittedUser('operator@example.test')
    const target = await createAdmittedUser('target@example.test')
    masqueradeOperatorEmails.add(actor.email)
    const token = await login(client, actor.email)
    const idle = await mode(client, token)
    const started = await start(client, token, idle.contextToken, target, 'view')
    started.assertStatus(200)
    const active = await mode(client, token)
    assert.isTrue(active.isMasquerading)
    const restrictedToken = await User.accessTokens.create(actor, ['profile:read'], {
      expiresIn: '1d',
    })

    const refused = await client
      .delete('/api/v1/account')
      .bearerToken(restrictedToken.value!.release())
      .header('X-Masquerade-Context', active.contextToken)
    refused.assertStatus(403)
    assert.deepEqual(responseBody<{ errors: Array<Record<string, string>> }>(refused).errors, [
      {
        code: 'E_MASQUERADE_ACTION_BLOCKED',
        message: 'Action is blocked while masquerading',
        blockedBy: 'sensitive',
      },
    ])

    assert.isNotNull(await User.find(actor.id))
    assert.isNotNull(await User.find(target.id))
    const modeAfterRefusal = await mode(client, token)
    assert.isTrue(modeAfterRefusal.isMasquerading)
  })

  test('an actor token without masquerade ability cannot create a team in edit mode', async ({
    client,
    assert,
  }) => {
    const actor = await createAdmittedUser('operator@example.test')
    const target = await createAdmittedUser('target@example.test')
    masqueradeOperatorEmails.add(actor.email)
    const token = await login(client, actor.email)
    const idle = await mode(client, token)
    const started = await start(client, token, idle.contextToken, target, 'edit')
    started.assertStatus(200)
    const active = await mode(client, token)
    assert.isTrue(active.isMasquerading)
    const restrictedToken = await User.accessTokens.create(actor, ['profile:read'], {
      expiresIn: '1d',
    })

    const refused = await client
      .post('/api/v1/teams')
      .bearerToken(restrictedToken.value!.release())
      .header('X-Masquerade-Context', active.contextToken)
      .json({ name: 'Should not exist' })
    refused.assertStatus(403)
    assert.deepEqual(responseBody<{ errors: Array<Record<string, string>> }>(refused).errors, [
      {
        code: 'E_MASQUERADE_ACTION_BLOCKED',
        message: 'Action is blocked while masquerading',
        blockedBy: 'sensitive',
      },
    ])

    assert.lengthOf(await db.from('teams'), 0)
    assert.isNotNull(await User.find(actor.id))
    assert.isNotNull(await User.find(target.id))
    const modeAfterRefusal = await mode(client, token)
    assert.isTrue(modeAfterRefusal.isMasquerading)
  })
})
