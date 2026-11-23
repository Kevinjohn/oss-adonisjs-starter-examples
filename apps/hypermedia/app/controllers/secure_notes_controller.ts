import type { HttpContext } from '@adonisjs/core/http'
import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import confirmations from '@kevinjohn/adonisjs-confirm-action-with-password/services/main'
import { errors } from '@kevinjohn/adonisjs-confirm-action-with-password'
import { managedGuard } from '#services/account_kit_guard'
import {
  clearSecureNoteDraft,
  noteRequest,
  readSecureNote,
  saveSecureNote,
  storeSecureNoteDraft,
} from '#services/secure_notes'
import { confirmSecureNoteValidator, saveSecureNoteValidator } from '#validators/secure_note'

export default class SecureNotesController {
  async edit(ctx: HttpContext) {
    // Discard drafts written by the previous session-based implementation.
    if (ctx.session.has('pendingSecureNote')) ctx.session.forget('pendingSecureNote')
    const input = await managedGuard.current(ctx)
    const props = await kit.authentication.withCurrent(input, readSecureNote)
    return ctx.view.render('pages/settings/secure_note', props)
  }

  async confirm(ctx: HttpContext) {
    const [validationError, note] = await ctx.request.tryValidateUsing(confirmSecureNoteValidator, {
      data: {
        body: ctx.request.input('body'),
        password: ctx.request.input('password'),
      },
    })
    if (validationError) {
      ctx.session.flash('error', 'Enter a note of 1 to 500 characters and your password.')
      return ctx.response.redirect().back()
    }
    const { body, password } = note
    const input = await managedGuard.current(ctx)
    await kit.authentication.withCurrent(input, clearSecureNoteDraft)
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
    await kit.authentication.withCurrent(input, (context) =>
      storeSecureNoteDraft(context, confirmationId, body)
    )
    return ctx.response.redirect().toPath('/settings/secure-note')
  }

  async update(ctx: HttpContext) {
    const [validationError, proof] = await ctx.request.tryValidateUsing(saveSecureNoteValidator, {
      data: { confirmationId: ctx.request.input('confirmationId') },
    })
    if (validationError) {
      ctx.session.flash('error', 'Confirm your password again before saving.')
      return ctx.response.redirect().toPath('/settings/secure-note')
    }
    const input = await managedGuard.current(ctx)
    const status = await kit.authentication.withCurrent(input, (context) =>
      saveSecureNote(context, proof.confirmationId)
    )

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
