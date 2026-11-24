import type { HttpContext } from '@adonisjs/core/http'
import type { CurrentAccountInput } from '@kevinjohn/adonisjs-account-kit'
import { readAccountInput } from '#services/account_input'
import { resolveGuardName } from '#services/auth_strategy'

export async function readCurrentAccountIfAuthenticated(
  ctx: HttpContext
): Promise<CurrentAccountInput | undefined> {
  const guard = ctx.auth.use(resolveGuardName())
  return (await guard.check()) ? readAccountInput(ctx) : undefined
}
