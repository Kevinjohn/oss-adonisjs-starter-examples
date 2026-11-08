import { DateTime } from 'luxon'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import { transaction } from '@kevinjohn/adonisjs-account-kit/transaction'
import accessControl from '#config/access_control'
import Team from '#models/team'
import User from '#models/user'
import { masqueradeOperatorEmails } from '#services/masquerade_operators'
import { softDeleteAdminEmails } from '#services/soft_delete_admins'

const demoUsers = [
  { email: 'alice@example.com', fullName: 'Alice Example' },
  { email: 'bob@example.com', fullName: 'Bob Example' },
]

const demoPassword = 'DemoPassword123!'

export default class DemoSeeder extends BaseSeeder {
  async run() {
    const configuredEmails = new Set(
      [
        masqueradeOperatorEmails.values().next().value,
        softDeleteAdminEmails.values().next().value,
      ].filter((email): email is string => typeof email === 'string')
    )
    const userIds = new Map<string, number>()

    for (const details of [
      ...demoUsers,
      ...[...configuredEmails].map((email) => ({ email, fullName: null })),
    ]) {
      const existing = await User.withTrashed().where('email', details.email).first()
      if (existing) {
        userIds.set(details.email, existing.id)
        continue
      }

      const user = await User.create({
        ...details,
        password: demoPassword,
        emailVerifiedAt: DateTime.now(),
      })
      userIds.set(details.email, user.id)
    }

    const aliceId = userIds.get('alice@example.com')!
    const bobId = userIds.get('bob@example.com')!
    const aliceMemberships = await accessControl.memberships.listForUser(aliceId)
    const ownedDemoTeamIds = aliceMemberships
      .filter((membership) => membership.role === 'owner')
      .map((membership) => membership.scopeId)
    const existingTeam = ownedDemoTeamIds.length
      ? await Team.query().where('name', 'Demo team').whereIn('id', ownedDemoTeamIds).first()
      : null

    if (!existingTeam) {
      await transaction(db, async (trx) => {
        const created = await Team.create({ name: 'Demo team' }, { client: trx })
        await accessControl.memberships.createFirstMember({
          scopeId: created.id,
          userId: aliceId,
          trx,
        })
        await accessControl.memberships.grant({
          scopeId: created.id,
          userId: bobId,
          role: 'viewer',
          trx,
        })
      })
    } else {
      const teamId = existingTeam.id
      const bobMemberships = await accessControl.memberships.listForUser(bobId)
      if (!bobMemberships.some((membership) => membership.scopeId === teamId)) {
        await transaction(db, async (trx) => {
          await accessControl.memberships.grant({
            scopeId: teamId,
            userId: bobId,
            role: 'viewer',
            trx,
          })
        })
      }
    }
  }
}
