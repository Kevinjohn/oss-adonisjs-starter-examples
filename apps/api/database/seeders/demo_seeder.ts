import { DateTime } from 'luxon'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
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
    const accounts = new Map<string, string>()

    for (const email of [...configuredEmails, 'alice@example.com', 'bob@example.com']) {
      const trimmedEmail = email.trim()
      const normalizedEmail = trimmedEmail.toLowerCase()
      if (normalizedEmail && !accounts.has(normalizedEmail)) {
        accounts.set(normalizedEmail, trimmedEmail)
      }
    }

    for (const email of accounts.values()) {
      if (await User.withTrashed().where('email', email.toLowerCase()).first()) continue

      await transaction(db, async (trx) => {
        const user = await User.create(
          {
            fullName: email.split('@')[0],
            email,
            password: demoPassword,
            emailVerifiedAt: DateTime.utc(),
          },
          { client: trx }
        )
        const now = DateTime.utc().toJSDate()
        await trx.table('account_admissions').insert({
          user_id: user.id,
          invited_email: user.email,
          invitation_source: 'operator',
          invitation_recorded_at: now,
          approval_status: 'approved',
          approval_decided_at: now,
          created_at: now,
          updated_at: now,
        })
      })
    }

    const alice = await User.withTrashed().where('email', 'alice@example.com').firstOrFail()
    const bob = await User.withTrashed().where('email', 'bob@example.com').firstOrFail()
    const namedTeams = await Team.query().where('name', demoTeamName)
    let team: Team | undefined
    for (const candidate of namedTeams) {
      const membership = await accessControl.memberships.find(candidate.id, alice.id)
      if (membership?.role === 'owner') {
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
