import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import kit from '@kevinjohn/adonisjs-account-kit/services/main'

/** Remove the browser session when the raw Account Kit guard rejects an existing sign-in. */
export default class StaleBrowserSessionMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const guard = ctx.auth.use('web')
    const userId = ctx.session.get(guard.sessionKeyName)
    if (userId !== undefined && !(await guard.check())) {
      const adapter = guard.forRequest()
      await kit.authentication.logout(
        adapter,
        undefined,
        typeof userId === 'number' || typeof userId === 'string'
          ? { userId, sessionHandle: adapter.previousHandle?.() }
          : undefined
      )
    }
    return next()
  }
}
