import type { HttpContext } from '@adonisjs/core/http'
import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import confirmations from '@kevinjohn/adonisjs-confirm-action-with-password/services/main'
import { errors } from '@kevinjohn/adonisjs-confirm-action-with-password'
import {
  clearSecureNoteDraft,
  buildNoteRequest,
  readSecureNote,
  saveSecureNote,
  storeSecureNoteDraft,
} from '#services/secure_notes'
import { confirmSecureNoteValidator, saveSecureNoteValidator } from '#validators/secure_note'

export default class SecureNotesController {
  async edit({ session, auth, inertia }: HttpContext) {
    // Discard drafts written by the previous session-based implementation.
    if (session.has('pendingSecureNote')) session.forget('pendingSecureNote')
    const input = await auth.use('web').current()
    const props = await kit.authentication.withCurrent(input, readSecureNote)
    return inertia.render('settings/secure_note', props)
  }

  async confirm({ request, session, response, auth }: HttpContext) {
    const [validationError, note] = await request.tryValidateUsing(confirmSecureNoteValidator, {
      data: {
        body: request.input('body'),
        password: request.input('password'),
      },
    })
    if (validationError) {
      session.flash('error', 'Enter a note of 1 to 500 characters and your password.')
      return response.redirect().back()
    }
    const { body, password } = note
    const input = await auth.use('web').current()
    await kit.authentication.withCurrent(input, clearSecureNoteDraft)
    let confirmationId: string
    try {
      const issued = await confirmations.confirmPassword(input, {
        ...buildNoteRequest(input.userId, body),
        password,
      })
      confirmationId = issued.confirmationId
    } catch (error) {
      if (error instanceof errors.PasswordConfirmationDeniedException) {
        session.flash('error', 'The password is incorrect.')
        return response.redirect().back()
      }
      if (error instanceof errors.PasswordConfirmationThrottledException) {
        session.flash('error', 'Too many attempts. Wait before trying again.')
        return response.redirect().back()
      }
      if (error instanceof errors.PasswordConfirmationStaleException) {
        session.flash('error', 'Confirmation timed out. Try again.')
        return response.redirect().back()
      }
      throw error
    }
    await kit.authentication.withCurrent(input, (context) =>
      storeSecureNoteDraft(context, confirmationId, body)
    )
    return response.redirect().toPath('/settings/secure-note')
  }

  async update({ request, session, response, auth }: HttpContext) {
    const [validationError, proof] = await request.tryValidateUsing(saveSecureNoteValidator, {
      data: { confirmationId: request.input('confirmationId') },
    })
    if (validationError) {
      session.flash('error', 'Confirm your password again before saving.')
      return response.redirect().toPath('/settings/secure-note')
    }
    const input = await auth.use('web').current()
    const status = await kit.authentication.withCurrent(input, (context) =>
      saveSecureNote(context, proof.confirmationId)
    )

    if (status === 'saved') {
      session.flash('success', 'Secure note saved.')
    } else if (status === 'expired') {
      session.flash(
        'error',
        'Confirmation expired or was already used. Confirm your password again.'
      )
    } else {
      session.flash('error', 'Confirm your password again before saving.')
    }
    return response.redirect().toPath('/settings/secure-note')
  }
}
