import { E_ACCOUNT_KIT_INVALID_INPUT } from '@kevinjohn/adonisjs-account-kit'
import type { AccountAdmission } from '@kevinjohn/adonisjs-account-kit/admission'

/** Integer ids must be positive integers, so a database never receives a malformed id. */
function requireUserIdParam(value: string): number {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64)
    throw new E_ACCOUNT_KIT_INVALID_INPUT('Invalid user ID')
  const id = /^[1-9]\d*$/.test(value) ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(id)) throw new E_ACCOUNT_KIT_INVALID_INPUT('Invalid user ID')
  return id
}

export async function decideAdmission(
  admission: AccountAdmission,
  actorId: number,
  id: string,
  decision: 'approve' | 'reject' | 'revoke'
) {
  const userId = requireUserIdParam(id)
  const record = await admission[decision]({ actorId, userId })
  return { userId: record.userId, approval: record.approval }
}
