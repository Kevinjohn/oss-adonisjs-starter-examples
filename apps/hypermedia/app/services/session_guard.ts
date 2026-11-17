// #region session_guard
import User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Lets Account Kit sign users in and out through the existing `web` session guard. The stored
 * revision is checked on every request by the session revision middleware.
 */
export function accountKitSessionGuard(ctx: HttpContext) {
  const guard = ctx.auth.use('web')
  return {
    strategy: 'session' as const,
    name: 'web',
    async establish(userId: number | string, revision: string | null, handle?: string) {
      ctx.session.regenerate()
      await guard.login(await User.findOrFail(userId))
      ctx.session.put('accountKitRevision', revision ?? '')
      if (handle) ctx.session.put('accountKitSession', handle)
      return undefined
    },
    previousHandle() {
      const handle = ctx.session.get('accountKitSession')
      return typeof handle === 'string' && handle !== '' ? handle : undefined
    },
    async refresh(revision: string | null) {
      ctx.session.regenerate()
      ctx.session.put('accountKitRevision', revision ?? '')
    },
    async terminate() {
      await guard.logout()
      ctx.session.clear()
      ctx.session.regenerate()
    },
  }
}
// #endregion session_guard

/** Read the registered sign-in without changing the guard selected by the route. */
export function currentBrowserSession(ctx: HttpContext) {
  const handle = ctx.session.get('accountKitSession')
  const revision = ctx.session.get('accountKitRevision')
  return {
    userId: ctx.auth.use('web').getUserOrFail().id,
    sessionHandle: typeof handle === 'string' ? handle : undefined,
    ...(typeof revision === 'string' ? { revision: revision === '' ? null : revision } : {}),
  }
}
