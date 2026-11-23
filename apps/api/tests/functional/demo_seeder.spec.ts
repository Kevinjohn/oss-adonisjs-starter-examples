import app from '@adonisjs/core/services/app'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import accessControl from '#config/access_control'
import DemoSeeder from '#database/seeders/demo_seeder'
import Team from '#models/team'
import User from '#models/user'
import { masqueradeOperatorEmails } from '#services/masquerade_operators'
import { isSoftDeleteAdmin } from '#services/soft_delete_admins'
import { AccountAdmission } from '@kevinjohn/adonisjs-account-kit/admission'
import { responseBody } from '#tests/helpers/response_body'
import { truncateDatabase } from '#tests/helpers/database'

const password = 'DemoPassword123!'

test.group('demo seeder', (group) => {
  group.each.setup(truncateDatabase)
  group.each.setup(() => {
    const operators = [...masqueradeOperatorEmails]
    masqueradeOperatorEmails.clear()
    masqueradeOperatorEmails.add('operator@example.test')
    return () => {
      masqueradeOperatorEmails.clear()
      for (const email of operators) masqueradeOperatorEmails.add(email)
    }
  })

  test('can run twice, avoid duplicate records, and sign in seeded accounts', async ({
    client,
    assert,
  }) => {
    const existingAdmin = await User.create({
      email: 'admin@example.com',
      password: 'ExistingPassword123!',
      isSoftDeleteAdmin: true,
    })
    const adminPasswordHash = existingAdmin.password
    await new DemoSeeder(db.connection()).run()
    const firstTeam = await Team.findByOrFail('name', 'Demo team')
    const firstBob = await User.findByOrFail('email', 'bob@example.com')
    // The first run must create the whole team; a second run must not be needed to finish it.
    const firstBobMembership = await accessControl.memberships.find(firstTeam.id, firstBob.id)
    assert.equal(firstBobMembership?.role, 'viewer')
    const seededBob = await User.findByOrFail('email', 'bob@example.com')
    const bobPasswordHash = seededBob.password
    await new DemoSeeder(db.connection()).run()

    const operatorEmail = masqueradeOperatorEmails.values().next().value
    assert.isString(operatorEmail, 'MASQUERADE_OPERATOR_EMAILS must configure an operator')

    const seededEmails = new Set(
      [operatorEmail!, 'alice@example.com', 'bob@example.com']
        .filter((email): email is string => Boolean(email))
        .map((email) => email.toLowerCase())
    )

    const admission = await app.container.make(AccountAdmission)
    for (const email of seededEmails) {
      const matches = await User.query().where('email', email)
      assert.lengthOf(matches, 1)
      assert.isNotNull(matches[0].emailVerifiedAt)
      assert.isTrue(await admission.isAdmitted(matches[0].id))
      assert.isFalse(isSoftDeleteAdmin(matches[0]))
    }

    const admin = await User.findByOrFail('email', 'admin@example.com')
    assert.isTrue(isSoftDeleteAdmin(admin))
    assert.equal(admin.password, adminPasswordHash)
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

    assert.lengthOf(await User.query().where('email', 'admin@example.com'), 1)
    const reseededBob = await User.findByOrFail('email', 'bob@example.com')
    assert.equal(reseededBob.password, bobPasswordHash)
    await bob.delete()
    await new DemoSeeder(db.connection()).run()
    const deletedBob = await User.withTrashed().where('email', bob.email).firstOrFail()
    assert.isTrue(deletedBob.trashed)
    assert.lengthOf(await User.withTrashed().where('email', bob.email), 1)
  })
})
