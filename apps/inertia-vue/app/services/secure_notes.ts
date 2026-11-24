import type { CurrentAccountContext } from '@kevinjohn/adonisjs-account-kit/types'
import confirmations from '@kevinjohn/adonisjs-confirm-action-with-password/services/main'
import { errors } from '@kevinjohn/adonisjs-confirm-action-with-password'

export function buildNoteRequest(userId: number | string, body: string) {
  return { action: 'save-secure-note', scope: String(userId), intent: { body } }
}

function requireSignInId(signInId: number | undefined) {
  if (signInId === undefined) throw new errors.SessionRegistryRequiredException()
  return signInId
}

export async function readSecureNote({ account, signInId, trx }: CurrentAccountContext) {
  const note = await trx.from('secure_notes').where('user_id', account.id).first()
  const pending = await trx
    .from('pending_secure_notes')
    .where('sign_in_id', requireSignInId(signInId))
    .select('body', 'confirmation_id as confirmationId')
    .first()
  return { body: note?.body ?? '', pending: pending ?? null }
}

export async function clearSecureNoteDraft({ signInId, trx }: CurrentAccountContext) {
  await trx.from('pending_secure_notes').where('sign_in_id', requireSignInId(signInId)).delete()
}

export async function storeSecureNoteDraft(
  { signInId, trx }: CurrentAccountContext,
  confirmationId: string,
  body: string
) {
  await trx
    .table('pending_secure_notes')
    .insert({ sign_in_id: requireSignInId(signInId), confirmation_id: confirmationId, body })
    .onConflict('sign_in_id')
    .merge()
}

export async function saveSecureNote(context: CurrentAccountContext, confirmationId: string) {
  const { account, signInId, trx } = context
  const match = {
    sign_in_id: requireSignInId(signInId),
    confirmation_id: confirmationId,
  }
  const pending = await trx.from('pending_secure_notes').where(match).first()
  if (!pending) return 'missing'

  try {
    await confirmations.consume(context, {
      ...buildNoteRequest(account.id, pending.body),
      confirmationId,
    })
  } catch (error) {
    if (
      !(error instanceof errors.PasswordConfirmationRequiredException) &&
      !(error instanceof errors.PasswordConfirmationStaleException)
    ) {
      throw error
    }
    await trx.from('pending_secure_notes').where(match).delete()
    return 'expired'
  }

  await trx.from('pending_secure_notes').where(match).delete()
  await trx
    .table('secure_notes')
    .insert({ user_id: account.id, body: pending.body })
    .onConflict('user_id')
    .merge()
  return 'saved'
}
