import type { HttpContext } from '@adonisjs/core/http'
import { RuntimeException } from '@adonisjs/core/exceptions'
import SocialProviderExchangeException from '#exceptions/social_provider_exchange_exception'
import { socialProviderCallbackValidator } from '#validators/social'
import {
  createAllySocialProvider,
  type SocialProvider,
  type SocialProviderName,
} from '@kevinjohn/adonisjs-account-kit'

function requireRequestContext(value: unknown): Pick<HttpContext, 'ally' | 'request' | 'params'> {
  if (!value || typeof value !== 'object' || !('ally' in value)) {
    throw new RuntimeException('A request-scoped Ally context is required')
  }
  return value as Pick<HttpContext, 'ally' | 'request' | 'params'>
}

export function createAllyProviderAdapter(name: SocialProviderName): SocialProvider {
  return createAllySocialProvider({
    async authorizationUrl(state, context) {
      try {
        return await requireRequestContext(context)
          .ally.use(name)
          .stateless()
          .redirectUrl((request) => request.param('state', state))
      } catch {
        throw new SocialProviderExchangeException('unavailable')
      }
    },
    async user(callback) {
      const ctx = requireRequestContext(callback)
      if (ctx.params.provider !== name)
        throw new SocialProviderExchangeException('provider_mismatch')
      const { error, code } = await ctx.request.validateUsing(socialProviderCallbackValidator)
      if (error) throw new SocialProviderExchangeException('denied')
      if (!code) throw new SocialProviderExchangeException('missing_code')
      try {
        return await ctx.ally.use(name).stateless().user()
      } catch {
        throw new SocialProviderExchangeException('unavailable')
      }
    },
  })
}
