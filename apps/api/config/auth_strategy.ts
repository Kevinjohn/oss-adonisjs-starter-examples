import env from '#start/env'

export function readConfiguredAuthStrategy() {
  return env.get('ACCOUNT_KIT_AUTH_STRATEGY') ?? 'access_tokens'
}
