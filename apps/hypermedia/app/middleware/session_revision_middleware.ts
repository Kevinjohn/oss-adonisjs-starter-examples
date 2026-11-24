import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import { InvalidSessionError } from '@kevinjohn/adonisjs-account-kit'
import { accountKitSessionGuard, readCurrentBrowserSession } from '#services/session_guard'

/**
 * Signs out a session that started before the latest password change or reset. Runs after the
 * silent auth middleware, so public pages then see no user, and the auth middleware sends
 * protected requests to the login page.
 */
export default class SessionRevisionMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    // The raw `web` guard is the signed-in account, even while it masquerades as another.
    const guard = ctx.auth.use('web')
    if (await guard.check()) {
      const current = readCurrentBrowserSession(ctx)
      try {
        await kit.authentication.current(current)
      } catch (error) {
        if (!(error instanceof InvalidSessionError)) throw error
        await kit.authentication.logout(accountKitSessionGuard(ctx), undefined, current)
      }
    }

    return next()
  }
}
