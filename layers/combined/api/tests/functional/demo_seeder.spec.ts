import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import accessControl from '#config/access_control'
import DemoSeeder from '#database/seeders/demo_seeder'
import Team from '#models/team'
import User from '#models/user'
import { masqueradeOperatorEmails } from '#services/masquerade_operators'
import { softDeleteAdminEmails } from '#services/soft_delete_admins'
import { isAdmitted } from '#services/account_admission_access'
import { responseBody } from '#tests/helpers/response_body'
import { truncateDatabase } from '#tests/helpers/database'

const password = 'DemoPassword123!'

test.group('demo seeder', (group) => {
  group.each.setup(truncateDatabase)
  group.each.setup(() => {
    const operators = [...masqueradeOperatorEmails]
    const admins = [...softDeleteAdminEmails]
    masqueradeOperatorEmails.clear()
    masqueradeOperatorEmails.add('operator@example.test')
    softDeleteAdminEmails.clear()
    softDeleteAdminEmails.add('admin@example.com')
    return () => {
      masqueradeOperatorEmails.clear()
      for (const email of operators) masqueradeOperatorEmails.add(email)
      softDeleteAdminEmails.clear()
      for (const email of admins) softDeleteAdminEmails.add(email)
    }
  })

  test('can run twice, avoid duplicate records, and sign in seeded accounts', async ({
    client,
    assert,
  }) => {
    await new DemoSeeder(db.connection()).run()
    const bobPasswordHash = (await User.findByOrFail('email', 'bob@example.com')).password
    await new DemoSeeder(db.connection()).run()

    const operatorEmail = masqueradeOperatorEmails.values().next().value
    assert.isString(operatorEmail, 'MASQUERADE_OPERATOR_EMAILS must configure an operator')

    const seededEmails = new Set(
      [
        operatorEmail!,
        softDeleteAdminEmails.values().next().value,
        'alice@example.com',
        'bob@example.com',
      ]
        .filter((email): email is string => Boolean(email))
        .map((email) => email.toLowerCase())
    )

    for (const email of seededEmails) {
      const matches = await User.query().where('email', email)
      assert.lengthOf(matches, 1)
      assert.isNotNull(matches[0].emailVerifiedAt)
      assert.isTrue(await isAdmitted(matches[0].id))
    }

    const alice = await User.findByOrFail('email', 'alice@example.com')
    const bob = await User.findByOrFail('email', 'bob@example.com')
    const teams = await Team.query().where('name', 'Demo team')
    assert.lengthOf(teams, 1)
    const team = teams[0]
    const aliceMembership = await accessControl.memberships.find(team.id, alice.id)
    const bobMembership = await accessControl.memberships.find(team.id, bob.id)
    assert.equal(aliceMembership?.role, 'owner')
    assert.equal(bobMembership?.role, 'viewer')

    for (const email of ['alice@example.com', operatorEmail!]) {
      const login = await client.post('/api/v1/auth/login').json({ email, password })
      login.assertStatus(200)
      assert.isString(responseBody<{ data: { token: string } }>(login).data.token)
    }

    assert.equal((await User.findByOrFail('email', 'bob@example.com')).password, bobPasswordHash)
    await bob.delete()
    await new DemoSeeder(db.connection()).run()
    assert.isTrue((await User.withTrashed().where('email', bob.email).firstOrFail()).trashed)
    assert.lengthOf(await User.withTrashed().where('email', bob.email), 1)
  })
})
