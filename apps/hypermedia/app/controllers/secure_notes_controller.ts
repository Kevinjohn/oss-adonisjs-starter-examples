import type { HttpContext } from '@adonisjs/core/http'
import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import confirmations from '@kevinjohn/adonisjs-confirm-action-with-password/services/main'
import { errors } from '@kevinjohn/adonisjs-confirm-action-with-password'
import { managedGuard } from '#services/account_kit_guard'

function noteRequest(userId: number | string, body: string) {
  return { action: 'save-secure-note', scope: String(userId), intent: { body } }
}

function requireSignInId(signInId: number | undefined) {
  if (signInId === undefined) throw new errors.SessionRegistryRequiredException()
  return signInId
}

export default class SecureNotesController {
  async edit(ctx: HttpContext) {
    // Discard drafts written by the previous session-based implementation.
    if (ctx.session.has('pendingSecureNote')) ctx.session.forget('pendingSecureNote')
    const input = await managedGuard.current(ctx)
    const props = await kit.authentication.withCurrent(
      input,
      async ({ account, signInId, trx }) => {
        const note = await trx.from('secure_notes').where('user_id', account.id).first()
        const pending = await trx
          .from('pending_secure_notes')
          .where('sign_in_id', requireSignInId(signInId))
          .select('body', 'confirmation_id as confirmationId')
          .first()
        return { body: note?.body ?? '', pending: pending ?? null }
      }
    )
    return ctx.view.render('pages/settings/secure_note', props)
  }

  async confirm(ctx: HttpContext) {
    const body = ctx.request.input('body')
    const password = ctx.request.input('password')
    if (
      typeof body !== 'string' ||
      body.length < 1 ||
      body.length > 500 ||
      typeof password !== 'string'
    ) {
      ctx.session.flash('error', 'Enter a note of 1 to 500 characters and your password.')
      return ctx.response.redirect().back()
    }
    const input = await managedGuard.current(ctx)
    await kit.authentication.withCurrent(input, async ({ signInId, trx }) => {
      await trx.from('pending_secure_notes').where('sign_in_id', requireSignInId(signInId)).delete()
    })
    let confirmationId: string
    try {
      const issued = await confirmations.confirmPassword(input, {
        ...noteRequest(input.userId, body),
        password,
      })
      confirmationId = issued.confirmationId
    } catch (error) {
      if (error instanceof errors.PasswordConfirmationDeniedException) {
        ctx.session.flash('error', 'The password is incorrect.')
        return ctx.response.redirect().back()
      }
      if (error instanceof errors.PasswordConfirmationThrottledException) {
        ctx.session.flash('error', 'Too many attempts. Wait before trying again.')
        return ctx.response.redirect().back()
      }
      if (error instanceof errors.PasswordConfirmationStaleException) {
        ctx.session.flash('error', 'Confirmation timed out. Try again.')
        return ctx.response.redirect().back()
      }
      throw error
    }
    await kit.authentication.withCurrent(input, async ({ signInId, trx }) => {
      await trx
        .table('pending_secure_notes')
        .insert({ sign_in_id: requireSignInId(signInId), confirmation_id: confirmationId, body })
        .onConflict('sign_in_id')
        .merge()
    })
    return ctx.response.redirect().toPath('/settings/secure-note')
  }

  async update(ctx: HttpContext) {
    const confirmationId = ctx.request.input('confirmationId')
    if (typeof confirmationId !== 'string' || confirmationId === '') {
      ctx.session.flash('error', 'Confirm your password again before saving.')
      return ctx.response.redirect().toPath('/settings/secure-note')
    }
    const input = await managedGuard.current(ctx)
    const status = await kit.authentication.withCurrent(input, async (context) => {
      const { account, signInId, trx } = context
      const match = {
        sign_in_id: requireSignInId(signInId),
        confirmation_id: confirmationId,
      }
      const pending = await trx.from('pending_secure_notes').where(match).first()
      if (!pending) return 'missing'

      try {
        await confirmations.consume(context, {
          ...noteRequest(account.id, pending.body),
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
    })

    if (status === 'saved') {
      ctx.session.flash('success', 'Secure note saved.')
    } else if (status === 'expired') {
      ctx.session.flash(
        'error',
        'Confirmation expired or was already used. Confirm your password again.'
      )
    } else {
      ctx.session.flash('error', 'Confirm your password again before saving.')
    }
    return ctx.response.redirect().toPath('/settings/secure-note')
  }
}
