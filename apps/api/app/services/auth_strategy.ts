import { authStrategy } from '#config/auth_strategy'

/** The example's selected auth strategy. Tests switch it; an application keeps one. */
export function readAuthStrategy() {
  return authStrategy
}

/** The AdonisJS guard for the selected auth strategy. */
export function resolveGuardName() {
  return readAuthStrategy() === 'session' ? 'web' : 'api'
}
