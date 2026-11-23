import { inject } from '@adonisjs/core'
import { AccountAccessDeniedError, AccountKit } from '@kevinjohn/adonisjs-account-kit'
import { AccountAdmission } from '@kevinjohn/adonisjs-account-kit/admission'
import { isAdmittedOwner } from './account_kit_authorization.js'

type AuthenticatedActor = { id: number | string }

@inject()
export class AccountAccessInspection {
  constructor(
    private readonly accountKit: AccountKit,
    private readonly admission: AccountAdmission
  ) {}

  /** Inspect an account only after the authenticated application actor passes its owner policy. */
  async inspectForOwner(actor: AuthenticatedActor, targetUserId: number | string) {
    if (!(await isAdmittedOwner(this.admission, actor.id))) return null

    try {
      return await this.accountKit.authentication.inspectAccountAccess({
        userId: targetUserId,
        requireActive: false,
      })
    } catch (error) {
      if (error instanceof AccountAccessDeniedError) return null
      throw error
    }
  }

  /** Compare a protected captured revision with a fresh inspection after reauthorizing the caller. */
  async compareRevisionForOwner(
    actor: AuthenticatedActor,
    targetUserId: number | string,
    expectedRevision: string | null
  ) {
    const current = await this.inspectForOwner(actor, targetUserId)
    if (!current) return { outcome: 'denied' as const }
    if (current.revision !== expectedRevision) return { outcome: 'changed' as const }
    return { outcome: 'current' as const, snapshot: current }
  }
}
