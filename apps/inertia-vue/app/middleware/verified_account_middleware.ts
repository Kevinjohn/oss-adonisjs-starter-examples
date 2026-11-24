import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { errors } from '@kevinjohn/adonisjs-account-kit'
import kit from '@kevinjohn/adonisjs-account-kit/services/main'

export default class VerifiedAccountMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const selectedGuard = ctx.auth.authenticatedViaGuard
    try {
      // The operator owns the session. Masquerade checks the target's account separately.
      await kit.authentication.requireActive(await ctx.auth.use('web').current())
    } catch (error) {
      if (!(error instanceof errors.E_ACCOUNT_KIT_UNVERIFIED_EMAIL)) throw error
      ctx.session.flash('error', 'Confirm your email address before opening this page.')
      return ctx.response.redirect().toRoute('dashboard')
    }

    // Reading Account Kit's current session selects the raw guard. Restore the route's
    // effective guard so downstream authorization and actions still use the Masquerade target.
    if (selectedGuard === 'web_effective') await ctx.auth.authenticateUsing([selectedGuard])
    return next()
  }
}
