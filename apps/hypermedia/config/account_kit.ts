import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { publicOrigin } from '#config/public_origin'
import {
  createActionUrls,
  createLogNotifications,
  createLucidAdapter,
  defineConfig,
} from '@kevinjohn/adonisjs-account-kit'
import { accessControlKitCallbacks } from '@kevinjohn/adonisjs-access-control/account-kit'
import { accountKitNotify } from '#services/account_kit_notifications'

const environment = app.inProduction ? 'production' : app.inTest ? 'test' : 'development'

const loadUser = async () => {
  const { default: User } = await import('#models/user')
  return User
}

/**
 * The optional starter full name is trimmed and stored on the new user when supplied.
 */
const fullNameFrom = (data: unknown) => {
  const fullName = (data as { fullName?: unknown } | null)?.fullName
  if (typeof fullName !== 'string' || fullName.trim() === '') return null
  return fullName.trim()
}

/**
 * Team invitations, acceptance, account deletion and export go through Access Control.
 */
const teamCallbacks = accessControlKitCallbacks()

const users = createLucidAdapter(loadUser, {
  mapRegistrationData(data, user) {
    user.fullName = fullNameFrom(data)
  },
})

export default defineConfig({
  users,
  enabled: [
    'passwordReset',
    'emailVerification',
    'emailPasswordManagement',
    'registration',
    'invitations',
    'sessionManagement',
  ],
  registration: {
    availability: 'open',
    mapFields: (data) => ({ fullName: fullNameFrom(data) }),
  },
  authentication: {
    strategy: 'session',
    guard: 'web',
    /**
     * Every account may sign in. Return false here to block an account.
     */
    canAccess: async () => true,
  },
  sessionManagement: { idleExpiry: '30d' },
  limiterSecret: env.get('APP_KEY').release(),
  /**
   * Team admins and owners invite to their team; Access Control answers every invitation check.
   */
  authorize: teamCallbacks.authorize,
  onInvitationAccepted: teamCallbacks.onInvitationAccepted,
  onAccountDeletingTransaction: teamCallbacks.onAccountDeletingTransaction,
  exportAccountData: teamCallbacks.exportAccountData,
  /**
   * Links are built from APP_URL only, and must use HTTPS outside localhost.
   */
  urls: createActionUrls({
    backendOrigin: publicOrigin,
    appFrontendUrl: publicOrigin,
    environment,
    destinations: {
      passwordReset: 'reset-password',
      emailVerification: 'verify-email',
      invitation: 'invitation',
      emailChange: 'confirm-email',
    },
  }),
  /**
   * Prints each email, link included, to the server log, and refuses to boot in production.
   * Before deploying, add @adonisjs/mail and switch to createMailNotifications.
   */
  notify: app.inTest
    ? accountKitNotify
    : createLogNotifications({ brandName: 'Account Kit Example', environment }),
  /**
   * Account Kit revokes registered sessions and advances the credential revision; the native guard
   * checks both on each request. The app has no separate credential store to update.
   */
  onCredentialsChangedTransaction: async () => {},
})
