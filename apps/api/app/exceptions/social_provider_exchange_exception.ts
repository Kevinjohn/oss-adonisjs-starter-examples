import { Exception } from '@adonisjs/core/exceptions'

/** A provider exchange failed; the category is safe to include in diagnostics. */
export default class SocialProviderExchangeException extends Exception {
  static status = 503
  static code = 'E_SOCIAL_PROVIDER_EXCHANGE'
  static message = 'Social provider exchange failed'

  constructor(readonly category: 'denied' | 'missing_code' | 'unavailable' | 'provider_mismatch') {
    super(SocialProviderExchangeException.message)
  }
}
