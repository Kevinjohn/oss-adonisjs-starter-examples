import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import accessControl from '#config/access_control'
import Team from '#models/team'
import User from '#models/user'
import DemoSeeder from '#database/seeders/demo_seeder'
import { masqueradeOperatorEmails } from '#services/masquerade_operators'
import { softDeleteAdminEmails } from '#services/soft_delete_admins'
import { setupAccountDatabase } from '#tests/helpers/account_database'
import { InertiaSession } from '#tests/helpers/inertia_session'

const password = 'DemoPassword123!'

test.group('demo seeder', (group) => {
  group.each.setup(async () => {
    const cleanup = await setupAccountDatabase()
    await limiter.clear(['memory'])
    const originalOperatorEmails = new Set(masqueradeOperatorEmails)
    const originalAdminEmails = new Set(softDeleteAdminEmails)
    return async () => {
      masqueradeOperatorEmails.clear()
      originalOperatorEmails.forEach((email) => masqueradeOperatorEmails.add(email))
      softDeleteAdminEmails.clear()
      originalAdminEmails.forEach((email) => softDeleteAdminEmails.add(email))
      await cleanup()
    }
  })

  test('seeds sign-in accounts and one owned team when run twice', async ({ assert }) => {
    masqueradeOperatorEmails.clear()
    masqueradeOperatorEmails.add('operator@example.test')
    masqueradeOperatorEmails.add('second-operator@example.test')
    softDeleteAdminEmails.clear()
    softDeleteAdminEmails.add('Admin@example.test')
    softDeleteAdminEmails.add('second-admin@example.test')
    const operatorEmail = 'operator@example.test'
    const existingAdmin = await User.create({
      email: 'Admin@example.test',
      password: 'ExistingPassword123!',
      emailVerifiedAt: DateTime.utc(),
    })
    const existingAdminPassword = existingAdmin.password

    const seeder = new DemoSeeder(db.connection())
    await seeder.run()
    const firstTeam = await Team.findByOrFail('name', 'Demo team')
    const firstBob = await User.findByOrFail('email', 'bob@example.com')
    // The first run must create the whole team; a second run must not be needed to finish it.
    const firstBobMembership = await accessControl.memberships.find(firstTeam.id, firstBob.id)
    assert.equal(firstBobMembership?.role, 'viewer')
    await seeder.run()

    const expectedEmails = [
      ...new Set([
        'alice@example.com',
        'bob@example.com',
        'operator@example.test',
        'Admin@example.test',
      ]),
    ].sort()
    const storedEmails = await db.from('users').select('email').orderBy('email')
    assert.deepEqual(
      storedEmails.map((row) => row.email),
      expectedEmails
    )

    const alice = await User.findByOrFail('email', 'alice@example.com')
    const bob = await User.findByOrFail('email', 'bob@example.com')
    const operator = await User.findByOrFail('email', operatorEmail)
    const admin = await User.findByOrFail('email', 'Admin@example.test')
    assert.isNotNull(alice.emailVerifiedAt)
    assert.isNotNull(bob.emailVerifiedAt)
    assert.isNotNull(operator.emailVerifiedAt)
    assert.isNotNull(admin.emailVerifiedAt)
    assert.equal(admin.password, existingAdminPassword)

    const teams = await Team.query().where('name', 'Demo team')
    assert.lengthOf(teams, 1)
    const team = teams[0]!
    const aliceMemberships = await accessControl.memberships.listForUser(alice.id)
    const bobMemberships = await accessControl.memberships.listForUser(bob.id)
    assert.equal(
      aliceMemberships.find((membership) => membership.scopeId === team.id)?.role,
      'owner'
    )
    assert.equal(
      bobMemberships.find((membership) => membership.scopeId === team.id)?.role,
      'viewer'
    )

    const bobPassword = bob.password
    await bob.delete()
    await seeder.run()
    const deletedBob = await User.withTrashed().where('id', bob.id).firstOrFail()
    assert.equal(deletedBob.password, bobPassword)
    assert.isNotNull(deletedBob.deletedAt)

    const aliceSession = new InertiaSession()
    await aliceSession.login(alice.email, password)
    const operatorSession = new InertiaSession()
    await operatorSession.login(operator.email, password)
    const operatorPage = await operatorSession.props<{ canMasquerade: boolean }>(
      '/masquerade/accounts'
    )
    assert.isTrue(operatorPage.canMasquerade)
  })
})
