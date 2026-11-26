import { test } from '@japa/runner'
import type { socialProviderCallbackValidator } from '#validators/social'
import SocialProviderExchangeException from '#exceptions/social_provider_exchange_exception'
import { createAllyProviderAdapter } from '#services/social_provider'

test('Ally adapter uses request-scoped state and rejects a crossed callback path', async ({
  assert,
}) => {
  let passedState: string | undefined
  let userCalls = 0
  let statelessCalls = 0
  let statelessReady = false
  let failUser = false
  const driver = {
    stateless() {
      statelessCalls++
      statelessReady = true
      return this
    },
    async redirectUrl(configure: (request: { param(name: string, value: string): void }) => void) {
      if (!statelessReady) throw new Error('Ally redirect must be stateless')
      statelessReady = false
      configure({
        param(name, value) {
          if (name === 'state') passedState = value
        },
      })
      return `https://provider.example.test/?state=${passedState}`
    },
    async user() {
      if (!statelessReady) throw new Error('Ally callback must be stateless')
      statelessReady = false
      userCalls++
      if (failUser) throw new Error('private provider payload')
      return {
        id: 'Google-Subject',
        email: 'verified@example.test',
        emailVerificationState: 'verified' as const,
        token: { token: 'provider-secret' },
      }
    },
  }
  const requestFor = (data: Record<string, unknown>) => ({
    validateUsing: (validator: typeof socialProviderCallbackValidator) => validator.validate(data),
  })
  const expectCategory = async (callback: unknown, category: string) => {
    let failure: unknown
    try {
      await provider.resolve(callback)
    } catch (error) {
      failure = error
    }
    assert.instanceOf(failure, SocialProviderExchangeException)
    assert.equal((failure as SocialProviderExchangeException).category, category)
    assert.equal((failure as SocialProviderExchangeException).code, 'E_SOCIAL_PROVIDER_EXCHANGE')
    assert.equal((failure as SocialProviderExchangeException).status, 503)
  }
  const provider = createAllyProviderAdapter('google')
  const context = {
    params: { provider: 'google' },
    request: requestFor({ code: 'provider-code' }),
    ally: {
      use(name: string) {
        assert.equal(name, 'google')
        return driver
      },
    },
  }
  const url = await provider.authorizationUrl('trusted-state', context)
  assert.equal(new URL(url).searchParams.get('state'), 'trusted-state')
  assert.equal(passedState, 'trusted-state')
  assert.equal(statelessCalls, 1)
  await expectCategory({ ...context, params: { provider: 'github' } }, 'provider_mismatch')
  await expectCategory({ ...context, request: requestFor({ error: 'access_denied' }) }, 'denied')
  await expectCategory({ ...context, request: requestFor({}) }, 'missing_code')
  await assert.rejects(
    () => provider.resolve({ ...context, request: requestFor({ code: ['not-a-string'] }) }),
    'Validation failure'
  )
  assert.equal(userCalls, 0)
  const profile = await provider.resolve(context)
  assert.equal(userCalls, 1)
  assert.equal(statelessCalls, 2)
  assert.equal(profile.subject, 'Google-Subject')
  assert.isTrue(profile.emailVerified)
  assert.notProperty(profile, 'token')
  failUser = true
  await expectCategory(context, 'unavailable')
})
