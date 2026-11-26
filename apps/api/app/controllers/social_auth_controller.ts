import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import {
  E_ACCOUNT_KIT_INVALID_INPUT,
  type SocialProviderName,
} from '@kevinjohn/adonisjs-account-kit'
import accountKit from '@kevinjohn/adonisjs-account-kit/services/main'
import { SocialCallbackResponseService } from '#services/social_callback_response_service'
import {
  beginBrowserTransaction,
  forgetBrowserContinuation,
  forgetBrowserTransaction,
  readPendingBrowserContinuation,
  readPendingBrowserTransaction,
  rememberBrowserContinuation,
} from '#services/social_browser_transaction'
import { readCurrentAccountIfAuthenticated } from '#services/social_request'
import {
  socialCallbackValidator,
  socialConfirmValidator,
  socialRedirectValidator,
} from '#validators/social'
import { socialRegistrationValidator } from '#validators/user'

function requireProviderParam(value: string): SocialProviderName {
  if (value !== 'google' && value !== 'github')
    throw new E_ACCOUNT_KIT_INVALID_INPUT('Unknown provider')
  return value
}

@inject()
export default class SocialAuthController {
  #callbackResponse: SocialCallbackResponseService

  constructor(callbackResponse: SocialCallbackResponseService) {
    this.#callbackResponse = callbackResponse
  }

  async redirect({ auth, session, params, request, ally, response }: HttpContext) {
    const provider = requireProviderParam(params.provider)
    const input = await request.validateUsing(socialRedirectValidator)
    const intent = input.intent ?? 'login'
    const current =
      intent === 'login' ? undefined : await readCurrentAccountIfAuthenticated({ auth, session })
    const transaction = beginBrowserTransaction({ session }, input.clientChallenge)
    const result = await accountKit.socialAuthentication.begin({
      provider,
      intent,
      current,
      clientChallenge: transaction.clientChallenge,
      purpose: input.purpose,
      proof: input.proof,
      context: { ally },
    })
    transaction.remember(result.state)
    return response.ok({ authorizationUrl: result.url })
  }

  async confirm({ session, params, request, ally, response }: HttpContext) {
    const provider = requireProviderParam(params.provider)
    const { verificationToken, clientChallenge } =
      await request.validateUsing(socialConfirmValidator)
    const transaction = beginBrowserTransaction({ session }, clientChallenge)
    const result = await accountKit.socialAuthentication.beginConfirmation({
      provider,
      verificationToken,
      clientChallenge: transaction.clientChallenge,
      context: { ally },
    })
    transaction.remember(result.state)
    return response.ok({ authorizationUrl: result.url })
  }

  async verificationEntry({ response, params }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    response.header('Referrer-Policy', 'no-referrer')
    return response.ok({ verificationToken: params.token })
  }

  async callback({ session, auth, response, serialize, params, request, ally }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    response.header('Referrer-Policy', 'no-referrer')
    const provider = requireProviderParam(params.provider)
    const { state, intent } = await request.validateUsing(socialCallbackValidator)
    const pending = readPendingBrowserTransaction({ session }, state)
    const current = await readCurrentAccountIfAuthenticated({ auth, session })
    const result = await accountKit.socialAuthentication.callback({
      state,
      provider,
      callback: { ally, params, request },
      current,
      intent,
    })
    if (pending) forgetBrowserTransaction({ session })
    if ('continuation' in result) {
      if (pending) rememberBrowserContinuation({ session }, result.continuation, pending)
      return response.ok({ status: 'new', continuation: result.continuation })
    }
    return this.#callbackResponse.finish(
      { auth, session, response, serialize },
      result,
      pending?.verifier
    )
  }

  async completeRegistration({ session, auth, response, serialize, request }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const { continuation, fullName, email } = await request.validateUsing(
      socialRegistrationValidator
    )
    const pending = readPendingBrowserContinuation({ session }, continuation)
    const result = await accountKit.socialAuthentication.completeRegistration({
      continuation,
      email,
      registrationData: { fullName },
    })
    if (pending) {
      forgetBrowserContinuation({ session })
      return this.#callbackResponse.finish(
        { auth, session, response, serialize },
        result,
        pending.verifier
      )
    }
    return response.ok(result)
  }
}
