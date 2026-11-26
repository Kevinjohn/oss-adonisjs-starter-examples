import type { HttpContext } from '@adonisjs/core/http'
import { readAuthStrategy, resolveGuardName } from '#services/auth_strategy'

export function readAccountInput(ctx: Pick<HttpContext, 'auth' | 'session'>) {
  const user = ctx.auth.use(resolveGuardName()).getUserOrFail()
  const revision = ctx.session.get('accountKitRevision')
  return readAuthStrategy() === 'session'
    ? {
        userId: user.id,
        ...(revision === undefined ? {} : { revision: revision === '' ? null : revision }),
      }
    : { userId: user.id, tokenId: user.currentAccessToken?.identifier?.toString() }
}
