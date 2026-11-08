import { test } from '@japa/runner'
import limiter from '@adonisjs/limiter/services/main'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import accessControl from '#config/access_control'
import DemoSeeder from '#database/seeders/demo_seeder'
import Team from '#models/team'
import User from '#models/user'
import { isMasqueradeOperator, masqueradeOperatorEmails } from '#services/masquerade_operators'
import { isSoftDeleteAdmin, softDeleteAdminEmails } from '#services/soft_delete_admins'
import { setupAccountDatabase } from '#tests/helpers/account_database'
import { FormSession } from '#tests/helpers/form_session'

const password = 'DemoPassword123!'
const operatorEmail = 'operator@example.com'
const adminEmail = 'Admin@Example.com'

test.group('demo seeder', (group) => {
  group.each.setup(async () => {
    const cleanup = await setupAccountDatabase()
    await limiter.clear(['memory'])
    const previousOperatorEmails = new Set(masqueradeOperatorEmails)
    const previousAdminEmails = new Set(softDeleteAdminEmails)
    masqueradeOperatorEmails.clear()
    masqueradeOperatorEmails.add(operatorEmail)
    softDeleteAdminEmails.clear()
    softDeleteAdminEmails.add(adminEmail)

    return async () => {
      masqueradeOperatorEmails.clear()
      for (const email of previousOperatorEmails) masqueradeOperatorEmails.add(email)
      softDeleteAdminEmails.clear()
      for (const email of previousAdminEmails) softDeleteAdminEmails.add(email)
      await cleanup()
    }
  })

  test('can run twice, avoid duplicates, and sign in seeded accounts', async ({ assert }) => {
    const existingAdmin = await User.create({
      email: adminEmail,
      password: 'ExistingPassword123!',
      emailVerifiedAt: DateTime.utc(),
    })
    const existingAdminPassword = existingAdmin.password

    await new DemoSeeder(db.connection()).run()
    await new DemoSeeder(db.connection()).run()

    const seededEmails = [operatorEmail, adminEmail, 'alice@example.com', 'bob@example.com']
    for (const email of seededEmails) {
      const matches = await User.query().where('email', email)
      assert.lengthOf(matches, 1)
      assert.isNotNull(matches[0].emailVerifiedAt)
    }

    const operator = await User.findByOrFail('email', operatorEmail)
    const alice = await User.findByOrFail('email', 'alice@example.com')
    const bob = await User.findByOrFail('email', 'bob@example.com')
    assert.isTrue(isMasqueradeOperator(operator))
    const admin = await User.findByOrFail('email', adminEmail)
    assert.isTrue(isSoftDeleteAdmin(admin))
    assert.equal(admin.password, existingAdminPassword)

    const teams = await Team.query().where('name', 'Demo team')
    assert.lengthOf(teams, 1)
    const team = teams[0]
    assert.equal((await accessControl.memberships.find(team.id, alice.id))?.role, 'owner')
    assert.equal((await accessControl.memberships.find(team.id, bob.id))?.role, 'viewer')

    const aliceSession = new FormSession()
    await aliceSession.login(alice.email, password)
    const aliceTeams = await aliceSession.request('/teams')
    assert.equal(aliceTeams.status, 200)
    assert.include(aliceSession.html, 'Demo team')

    const operatorSession = new FormSession()
    await operatorSession.login(operator.email, password)
    const operatorPage = await operatorSession.request('/masquerade/accounts')
    assert.equal(operatorPage.status, 200)

    await bob.delete()
    await new DemoSeeder(db.connection()).run()
    const storedBob = await User.withTrashed().where('email', bob.email).firstOrFail()
    assert.isNotNull(storedBob.deletedAt)
    assert.lengthOf(await Team.query().where('name', 'Demo team'), 1)
  })
})
