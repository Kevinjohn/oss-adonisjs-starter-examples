import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import { errors, passwordChangeRevision } from '@kevinjohn/adonisjs-account-kit'
import type { HttpContext } from '@adonisjs/core/http'
import { changePasswordValidator } from '#validators/account'
import { managedGuard } from '#services/account_kit_guard'
import { accountKitSessionGuard } from '#services/session_guard'

export default class PasswordsController {
  async edit({ inertia }: HttpContext) {
    return inertia.render('settings/password', {})
  }

  /** Account Kit keeps this registered sign-in and ends the others. */
  async update(ctx: HttpContext) {
    const { currentPassword, password } = await ctx.request.validateUsing(changePasswordValidator)
    const user = ctx.auth.getUserOrFail()
    const current = await managedGuard.current(ctx)
    let revision: string | null
    let followUp = ''
    try {
      ;({ revision } = await kit.emailPasswordManagement.changePassword({
        actorId: user.id,
        currentPassword,
        newPassword: password,
        keepCurrent: { sessionHandle: current.sessionHandle! },
      }))
    } catch (error) {
      // A follow-up failed after commit: the change stands, so keep this session on its revision.
      const committed = passwordChangeRevision(error)
      if (committed === undefined) throw error
      revision = committed
      ctx.logger.error(
        { event: 'password_change_follow_up_failed' },
        'Password changed but a follow-up failed'
      )
      followUp =
        error instanceof errors.DeliveryError
          ? ' The notification email could not be sent.'
          : ' A follow-up step failed.'
    }
    await accountKitSessionGuard(ctx).refresh(revision)
    ctx.session.flash('success', `Password changed. Other devices have been signed out.${followUp}`)
    return ctx.response.redirect().withQs(false).toPath('/settings/password')
  }
}
