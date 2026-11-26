import env from '#start/env'

export const authStrategy = env.get('ACCOUNT_KIT_AUTH_STRATEGY') ?? 'access_tokens'
