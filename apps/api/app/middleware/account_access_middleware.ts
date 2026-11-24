import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import accountKit from '@kevinjohn/adonisjs-account-kit/services/main'
import { readAccountInput } from '#services/account_input'

export { readAccountInput }

/** Credential and restriction gate for routes an inactive account may use. */
export default class AccountAccessMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await accountKit.authentication.current(readAccountInput(ctx))
    return next()
  }
}
