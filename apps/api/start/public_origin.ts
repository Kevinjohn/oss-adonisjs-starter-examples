import env from '#start/env'
import { resolvePublicOrigin } from '@kevinjohn/adonisjs-origin-guard'

export const publicOrigin = resolvePublicOrigin(
  env.get('APP_URL'),
  env.get('NODE_ENV'),
  'APP_URL'
).origin
