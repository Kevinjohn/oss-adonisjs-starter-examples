import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { transaction } from '@kevinjohn/adonisjs-account-kit/transaction'
import accessControl from '#config/access_control'
import Team from '#models/team'
import User from '#models/user'
import { masqueradeOperatorEmails } from '#services/masquerade_operators'
import { softDeleteAdminEmails } from '#services/soft_delete_admins'

const demoPassword = 'DemoPassword123!'
const demoTeamName = 'Demo team'

export default class DemoSeeder extends BaseSeeder {
  async run() {
    const configuredEmails = [
      masqueradeOperatorEmails.values().next().value,
      softDeleteAdminEmails.values().next().value,
    ].filter((email): email is string => Boolean(email))
    const demoEmails = new Set<string>()

    for (const email of [...configuredEmails, 'alice@example.com', 'bob@example.com']) {
      const configuredEmail = email.trim()
      if (configuredEmail) demoEmails.add(configuredEmail)
    }

    for (const email of demoEmails) {
      const existing = await User.withTrashed().where('email', email).first()
      if (existing) continue

      await User.create({
        fullName: email.split('@')[0],
        email,
        password: demoPassword,
        emailVerifiedAt: DateTime.utc(),
      })
    }

    const alice = await User.withTrashed().where('email', 'alice@example.com').firstOrFail()
    const bob = await User.withTrashed().where('email', 'bob@example.com').firstOrFail()
    const aliceMemberships = await accessControl.memberships.listForUser(alice.id)
    let team: Team | null = null

    for (const membership of aliceMemberships) {
      if (membership.role !== 'owner') continue
      const candidate = await Team.findBy('id', membership.scopeId)
      if (candidate?.name === demoTeamName) {
        team = candidate
        break
      }
    }

    if (!team) {
      await transaction(db, async (trx) => {
        const created = await Team.create({ name: demoTeamName }, { client: trx })
        await accessControl.memberships.createFirstMember({
          scopeId: created.id,
          userId: alice.id,
          trx,
        })
        await accessControl.memberships.grant({
          scopeId: created.id,
          userId: bob.id,
          role: 'viewer',
          trx,
        })
      })
      return
    }

    const existingTeam = team
    await transaction(db, async (trx) => {
      const bobMembership = await accessControl.memberships.find(existingTeam.id, bob.id, trx)
      if (!bobMembership) {
        await accessControl.memberships.grant({
          scopeId: existingTeam.id,
          userId: bob.id,
          role: 'viewer',
          trx,
        })
      }
    })
  }
}
