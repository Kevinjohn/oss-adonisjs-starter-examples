import assert from 'node:assert/strict'
import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import { errors, passwordChangeRevision } from '@kevinjohn/adonisjs-account-kit'
import type { HttpContext } from '@adonisjs/core/http'
import { changePasswordValidator } from '#validators/account'

export default class PasswordsController {
  async edit({ view }: HttpContext) {
    return view.render('pages/settings/password')
  }

  async update(ctx: HttpContext) {
    const { currentPassword, password } = await ctx.request.validateUsing(changePasswordValidator)
    const user = ctx.auth.getUserOrFail()
    const current = await ctx.auth.use('web').current()
    let notified = true
    let revision: string | null
    try {
      ;({ revision } = await kit.emailPasswordManagement.changePassword({
        actorId: user.id,
        currentPassword,
        newPassword: password,
        keepCurrent: { sessionHandle: current.sessionHandle! },
      }))
    } catch (error) {
      // The new password is already saved; only the notification or another follow-up failed.
      const committed = passwordChangeRevision(error)
      if (committed !== undefined) {
        notified = false
        revision = committed
      } else if (
        error instanceof errors.E_INVALID_CREDENTIALS ||
        error instanceof errors.E_ACCOUNT_KIT_IDENTITY_NOT_CONFIRMED
      ) {
        ctx.session.flash('error', 'Your current password is incorrect. Check it and try again.')
        return ctx.response.redirect().back()
      } else throw error
    }
    const unsent = notified ? '' : ' We could not send the confirmation email.'
    // Account Kit keeps this registered sign-in and ends the others. Refreshing the session gives
    // this browser a new cookie id and stores the new credential revision.
    const guard = ctx.auth.use('web').forRequest()
    assert(guard.strategy === 'session' && guard.refresh)
    await guard.refresh(revision)
    ctx.session.flash('success', `Password changed. Other sessions have been signed out.${unsent}`)
    return ctx.response.redirect().toPath('/settings/password')
  }
}
