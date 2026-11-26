import { HttpContext } from '@adonisjs/core/http'
import type { MasqueradeRuntime } from '@kevinjohn/adonisjs-masquerade/masquerade_provider'
import User from '#models/user'
import type { MasqueradeFormFlash } from '#services/masquerade_form'
import { isMasqueradeOperator, masqueradeOperatorEmails } from '#services/masquerade_operators'

/** The operator's own page, on the raw `web` guard: start and stop forms. */
export default class MasqueradeAccountsController {
  async index({ response, auth, containerResolver, inertia, session }: HttpContext) {
    response.header('Cache-Control', 'private, no-store')
    const operator = auth.use('web').getUserOrFail()
    const runtime = (await containerResolver.make('masquerade.runtime')) as MasqueradeRuntime
    const mode = await runtime.service.status(await containerResolver.make(HttpContext))
    const canMasquerade = isMasqueradeOperator(operator)
    const accounts = canMasquerade && !mode.isMasquerading ? await listCandidateAccounts() : []
    const target = mode.isMasquerading ? await User.find(mode.targetId) : null
    return inertia.render('masquerade/accounts', {
      operatorEmail: operator.email,
      canMasquerade,
      expired: mode.isMasquerading && Date.parse(mode.expiresAt) <= Date.now(),
      mode: mode.isMasquerading
        ? {
            isMasquerading: true as const,
            contextToken: mode.contextToken,
            targetId: mode.targetId,
            access: mode.access,
            expiresAt: mode.expiresAt,
          }
        : { isMasquerading: false as const, contextToken: mode.contextToken },
      accounts: accounts.map((user) => ({ id: user.id, email: user.email })),
      targetEmail: target?.email ?? null,
      outcome: buildFormOutcome(session.flashMessages.get('masquerade')) ?? null,
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
      type: 'success' as const,
      message: message.action === 'started' ? 'Masquerade started.' : 'Masquerade stopped.',
    }
  return {
    type: 'error' as const,
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
