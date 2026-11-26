import type { HttpContext } from '@adonisjs/core/http'
import { E_ACCOUNT_KIT_INVALID_TOKEN } from '@kevinjohn/adonisjs-account-kit'
import accountKit from '@kevinjohn/adonisjs-account-kit/services/main'
import { passwordValidator } from '#validators/account_kit'
import { sendProofFailure, setProofResponseHeaders } from '#services/http_responses'
import { runCommittedFollowUp } from '#services/committed_failure_diagnostic'

export default class EmailVerificationsController {
  async send({ auth, response, logger }: HttpContext) {
    const actor = await auth.getUserOrFail()
    const result = await runCommittedFollowUp(logger, 'email_verification.send', () =>
      accountKit.emailVerification.send({ userId: actor.id })
    )
    return response.ok({ result: result ?? 'sent' })
  }

  async inspect({ response, request, params }: HttpContext) {
    setProofResponseHeaders({ response })
    if (!(await accountKit.emailVerification.inspect({ token: params.token }))) {
      return sendProofFailure({ request, response }, 'E_ACCOUNT_KIT_INVALID_EMAIL_TOKEN')
    }
    return response.ok({ confirmation: true })
  }

  async complete({ response, request, logger, params }: HttpContext) {
    setProofResponseHeaders({ response })
    const { password } = await request.validateUsing(passwordValidator)
    try {
      const result = await runCommittedFollowUp(logger, 'email_verification.complete', () =>
        accountKit.emailVerification.complete({ token: params.token, password })
      )
      return response.ok({ result: result ?? 'verified' })
    } catch (error) {
      if (error instanceof E_ACCOUNT_KIT_INVALID_TOKEN)
        return sendProofFailure({ request, response }, 'E_ACCOUNT_KIT_INVALID_EMAIL_TOKEN')
      throw error
    }
  }
}
