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

test.group('masquerade with soft delete', (group) => {
  group.each.setup(truncateDatabase)
  group.each.setup(async () => {
    const originalOperators = [...masqueradeOperatorEmails]
    masqueradeOperatorEmails.clear()
    return () => {
      masqueradeOperatorEmails.clear()
      for (const email of originalOperators) masqueradeOperatorEmails.add(email)
    }
  })

  test('a soft-deleted account cannot be a masquerade target', async ({ client, assert }) => {
    const actor = await createAdmittedUser('operator@example.test')
    const target = await createAdmittedUser('target@example.test')
    masqueradeOperatorEmails.add(actor.email)

    const actorToken = await login(client, actor.email)
    const initialMode = await mode(client, actorToken)
    assert.isFalse(initialMode.isMasquerading)

    const validStart = await client
      .post('/masquerade/start')
      .bearerToken(actorToken)
      .header('X-Masquerade-Context', initialMode.contextToken)
      .json({ targetId: String(target.id), access: 'edit' })
    assert.equal(validStart.status(), 200)
    const activeMode = await mode(client, actorToken)
    assert.isTrue(activeMode.isMasquerading)

    const validStop = await client
      .post('/masquerade/stop')
      .bearerToken(actorToken)
      .header('X-Masquerade-Context', activeMode.contextToken)
    assert.equal(validStop.status(), 200)
    const beforeDeleteMode = await mode(client, actorToken)
    assert.isFalse(beforeDeleteMode.isMasquerading)

    await target.delete()
    const storedTarget = await User.withTrashed().where('id', target.id).firstOrFail()
    assert.isTrue(storedTarget.trashed)

    const refused = await client
      .post('/masquerade/start')
      .bearerToken(actorToken)
      .header('X-Masquerade-Context', beforeDeleteMode.contextToken)
      .json({ targetId: String(target.id), access: 'edit' })
    assert.equal(refused.status(), 403)
    assert.equal(
      responseBody<{ errors: Array<{ code: string }> }>(refused).errors[0].code,
      'E_MASQUERADE_NOT_ALLOWED'
    )

    const afterRefusal = await mode(client, actorToken)
    assert.isFalse(afterRefusal.isMasquerading)
    assert.lengthOf(
      await db
        .from('masquerade_modes')
        .where('actor_id', String(actor.id))
        .where('state', 'active'),
      0
    )
    const effectiveAccount = await client.get('/api/v1/masquerade/account').bearerToken(actorToken)
    assert.equal(effectiveAccount.status(), 200)
    assert.deepEqual(effectiveAccount.body(), { id: actor.id, email: actor.email })
  })
})
