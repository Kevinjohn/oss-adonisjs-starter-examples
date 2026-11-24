import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import type { HttpContext } from '@adonisjs/core/http'
import { accountKitSessionGuard, readCurrentBrowserSession } from '#services/session_guard'

export default class AccountDeletionController {
  /** Shows the confirmation page. */
  async show({ inertia }: HttpContext) {
    return inertia.render('account/delete', {})
  }

  /**
   * Soft deletes the signed-in account and signs it out. The row stays, so an administrator can
   * restore it, but normal queries no longer find it, so it cannot sign in again.
   */
  async destroy(ctx: HttpContext) {
    const current = readCurrentBrowserSession(ctx)
    await ctx.auth.getUserOrFail().delete()
    await kit.authentication.logout(accountKitSessionGuard(ctx), undefined, current)
    return ctx.response.redirect().toRoute('session.create')
  }
}
