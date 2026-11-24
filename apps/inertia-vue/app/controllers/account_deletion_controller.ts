import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import type { HttpContext } from '@adonisjs/core/http'

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
    const current = await ctx.auth.use('web').current()
    await ctx.auth.getUserOrFail().delete()
    await kit.authentication.logout(ctx.auth.use('web').forRequest(), undefined, current)
    return ctx.response.redirect().toRoute('session.create')
  }
}
