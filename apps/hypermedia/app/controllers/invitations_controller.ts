import type { HttpContext } from '@adonisjs/core/http'
import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import { errors } from '@kevinjohn/adonisjs-account-kit'
import { isDeliveryFailure } from '#services/delivery_failure'
import { sendTokenPageHeaders } from '#services/token_page_headers'
import { acceptInvitationValidator } from '#validators/team'

/** The invitation link: choose a password to create the account and join the team. */
export default class InvitationsController {
  async edit({ response, params, view }: HttpContext) {
    sendTokenPageHeaders(response)
    const invitation = await kit.invitations.inspect({ token: params.token })
    return view.render('pages/auth/accept_invitation', {
      token: params.token,
      email: invitation?.email,
    })
  }

  async update({ response, request, params, session, logger }: HttpContext) {
    sendTokenPageHeaders(response)
    const { fullName, password } = await request.validateUsing(acceptInvitationValidator)
    try {
      await kit.invitations.accept({
        token: params.token,
        password,
        registrationData: { fullName },
      })
    } catch (error) {
      if (error instanceof errors.E_ACCOUNT_KIT_INVALID_TOKEN) {
        session.flash('error', 'This invitation is invalid, already used, or expired.')
        return response.redirect().withQs(false).toRoute('session.create')
      }
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
