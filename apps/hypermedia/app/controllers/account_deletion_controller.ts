import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import type { HttpContext } from '@adonisjs/core/http'

export default class AccountDeletionController {
  /** Shows the confirmation page. */
  async show({ view }: HttpContext) {
    return view.render('pages/account/delete')
  }

  /**
   * Soft deletes the signed-in account and signs it out. The row stays, so an administrator can
   * restore it, but normal queries no longer find it, so it cannot sign in again.
   */
  async destroy({ auth, response }: HttpContext) {
    const current = await auth.use('web').current()
    await auth.getUserOrFail().delete()
    await kit.authentication.logout(auth.use('web').forRequest(), undefined, current)
    return response.redirect().toRoute('session.create')
  }
}
