import { test } from '@japa/runner'
import { readAuthStrategy, resolveGuardName } from '#services/auth_strategy'
import env from '#start/env'

test('reads the current auth strategy and guard after environment changes', ({
  assert,
  cleanup,
}) => {
  const key = 'ACCOUNT_KIT_AUTH_STRATEGY'
  const originalStrategy = env.get(key)
  const originalEnvironmentValue = process.env[key]
  cleanup(() => {
    env.set(key, originalStrategy)
    if (originalEnvironmentValue === undefined) delete process.env[key]
    else process.env[key] = originalEnvironmentValue
  })

  env.set(key, 'access_tokens')
  assert.equal(readAuthStrategy(), 'access_tokens')
  assert.equal(resolveGuardName(), 'api')

  env.set(key, 'session')
  assert.equal(readAuthStrategy(), 'session')
  assert.equal(resolveGuardName(), 'web')
})
