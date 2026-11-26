import { HttpContext } from '@adonisjs/core/http'
import type { MasqueradeRuntime } from '@kevinjohn/adonisjs-masquerade/masquerade_provider'
import User from '#models/user'
import type { MasqueradeFormFlash } from '#services/masquerade_form_service'
import { isMasqueradeOperator, masqueradeOperatorEmails } from '#services/masquerade_operators'

/** The operator's own page, on the raw `web` guard: start and stop forms. */
export default class MasqueradeAccountsController {
  async index({ response, auth, containerResolver, view, session }: HttpContext) {
    response.header('Cache-Control', 'private, no-store')
    const operator = auth.use('web').getUserOrFail()
    const runtime = (await containerResolver.make('masquerade.runtime')) as MasqueradeRuntime
    const mode = await runtime.service.status(await containerResolver.make(HttpContext))
    const canMasquerade = isMasqueradeOperator(operator)
    const accounts = canMasquerade && !mode.isMasquerading ? await listCandidateAccounts() : []
    const target = mode.isMasquerading ? await User.find(mode.targetId) : null
    return view.render('pages/masquerade/accounts', {
      operator,
      canMasquerade,
      mode,
      expired: mode.isMasquerading && Date.parse(mode.expiresAt) <= Date.now(),
      accounts,
      target,
      outcome: buildFormOutcome(session.flashMessages.get('masquerade')),
    })
  }
}

const errorMessages: Record<string, string> = {
  E_MASQUERADE_NOT_ALLOWED: 'You cannot act as that account.',
  E_MASQUERADE_ALREADY_ACTIVE: 'Stop the current masquerade first.',
  E_MASQUERADE_CONTEXT_CHANGED: 'This page was out of date. Try again.',
}

/** English copy for the form controller's flash message. */
function buildFormOutcome(flash: unknown) {
  const message = flash as MasqueradeFormFlash | undefined
  if (!message) return undefined
  if (message.type === 'success')
    return {
      type: 'success',
      message: message.action === 'started' ? 'Masquerade started.' : 'Masquerade stopped.',
    }
  return {
    type: 'error',
    message: errorMessages[message.code] ?? 'Masquerade is not available right now. Try again.',
  }
}

/** Keep the demo chooser bounded; a production host should add search or pagination. */
async function listCandidateAccounts() {
  const query = User.query().select('id', 'email').orderBy('email').limit(50)
  if (masqueradeOperatorEmails.size) {
    const operators = [...masqueradeOperatorEmails]
    query.whereRaw(`lower(email) not in (${operators.map(() => '?').join(', ')})`, operators)
  }
  return query
}
