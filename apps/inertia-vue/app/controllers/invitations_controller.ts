import type { HttpContext } from '@adonisjs/core/http'
import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import { isDeliveryFailure } from '#services/delivery_failure'
import { sendTokenPageHeaders } from '#services/token_page_headers'
import { acceptInvitationValidator } from '#validators/team'

/**
 * The invitation link: choose a password to create the account and join the team. An invalid
 * token on submit is redirected to the sign-in page by the exception handler.
 */
export default class InvitationsController {
  async edit({ inertia, params, response }: HttpContext) {
    sendTokenPageHeaders(response)
    const invitation = await kit.invitations.inspect({ token: params.token })
    return inertia.render('auth/accept_invitation', {
      token: params.token,
      email: invitation?.email ?? null,
    })
  }

  async update({ response, request, params, logger, session }: HttpContext) {
    sendTokenPageHeaders(response)
    const { fullName, password } = await request.validateUsing(acceptInvitationValidator)
    try {
      await kit.invitations.accept({
        token: params.token,
        password,
        registrationData: { fullName },
      })
    } catch (error) {
      if (!isDeliveryFailure(error)) throw error
      logger.error(
        { event: 'invitation_follow_up_failed' },
        'Acceptance committed but a follow-up failed'
      )
    }
    session.flash('success', 'Your account is ready. Sign in to open your team.')
    return response.redirect().withQs(false).toRoute('session.create')
  }
}
