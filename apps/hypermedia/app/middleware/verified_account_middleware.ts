import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import { errors } from '@kevinjohn/adonisjs-account-kit'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { currentBrowserSession } from '#services/session_guard'

export default class VerifiedAccountMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    try {
      // The operator owns the session. Masquerade checks the target's account separately.
      await kit.authentication.requireActive(currentBrowserSession(ctx))
    } catch (error) {
      if (!(error instanceof errors.UnverifiedEmailError)) throw error
      ctx.session.flash('error', 'Confirm your email address to open this protected page.')
      return ctx.response.redirect().toRoute('dashboard')
    }
    return next()
  }
}
