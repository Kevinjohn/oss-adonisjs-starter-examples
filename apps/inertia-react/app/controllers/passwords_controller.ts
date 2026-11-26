import assert from 'node:assert/strict'
import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import { errors, passwordChangeRevision } from '@kevinjohn/adonisjs-account-kit'
import type { HttpContext } from '@adonisjs/core/http'
import { changePasswordValidator } from '#validators/account'

export default class PasswordsController {
  async edit({ inertia }: HttpContext) {
    return inertia.render('settings/password', {})
  }

  /** Account Kit keeps this registered sign-in and ends the others. */
  async update({ request, auth, logger, session, response }: HttpContext) {
    const { currentPassword, password } = await request.validateUsing(changePasswordValidator)
    const user = auth.getUserOrFail()
    const current = await auth.use('web').current()
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
      logger.error(
        { event: 'password_change_follow_up_failed' },
        'Password changed but a follow-up failed'
      )
      followUp =
        error instanceof errors.E_ACCOUNT_KIT_DELIVERY
          ? ' The notification email could not be sent.'
          : ' A follow-up step failed.'
    }
    const guard = auth.use('web').forRequest()
    assert(guard.strategy === 'session' && guard.refresh)
    await guard.refresh(revision)
    session.flash('success', `Password changed. Other devices have been signed out.${followUp}`)
    return response.redirect().withQs(false).toPath('/settings/password')
  }
}
