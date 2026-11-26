import type { HttpContext } from '@adonisjs/core/http'
import accountKit from '@kevinjohn/adonisjs-account-kit/services/main'
import accountKitConfig from '#config/account_kit'
import { readAccountInput } from '#middleware/account_access_middleware'
import { readLastUsedMethod } from '#services/last_used_method'

export default class AuthMethodsController {
  async methods({ auth, session, request, response }: HttpContext) {
    const current = readAccountInput({ auth, session })
    const [account, identities] = await Promise.all([
      accountKit.authentication.current(current),
      accountKit.socialAuthentication.list({ current }),
    ])
    const configuredProviders = Object.keys(accountKitConfig.socialAuthentication?.providers ?? {})
    return response.ok({
      password: account.hasPassword,
      configuredProviders,
      lastUsedMethod: readLastUsedMethod(
        { request },
        {
          password: account.hasPassword,
          providers: configuredProviders,
        }
      ),
      social: identities.map((identity) => ({ id: identity.id, provider: identity.provider })),
    })
  }
}
