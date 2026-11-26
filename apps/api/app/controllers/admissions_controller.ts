import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { AccountAdmission } from '@kevinjohn/adonisjs-account-kit/admission'
import { readAccountInput } from '#services/account_input'
import { decideAdmission } from '#services/admission_decision'
import { admissionListValidator } from '#validators/admission'

/**
 * The account's own admission status and request, reachable while not admitted, and the owner's
 * list and decisions. The package sends no notification: this status is how a person learns the
 * decision.
 */
@inject()
export default class AdmissionsController {
  constructor(private readonly admission: AccountAdmission) {}

  async show({ auth, session, response }: HttpContext) {
    const { decision } = await this.admission.current(readAccountInput({ auth, session }))
    return response.ok(decision)
  }

  async request({ auth, session, response }: HttpContext) {
    const record = await this.admission.request(readAccountInput({ auth, session }))
    return response.ok({ requestedAt: record.requestedAt })
  }

  async index({ auth, request, response }: HttpContext) {
    const actor = await auth.getUserOrFail()
    const { status, cursor, limit } = await request.validateUsing(admissionListValidator)
    return response.ok(await this.admission.list({ actorId: actor.id, status, cursor, limit }))
  }

  async approve({ auth, response, params }: HttpContext) {
    const actor = await auth.getUserOrFail()
    return response.ok(await decideAdmission(this.admission, actor.id, params.id, 'approve'))
  }

  async reject({ auth, response, params }: HttpContext) {
    const actor = await auth.getUserOrFail()
    return response.ok(await decideAdmission(this.admission, actor.id, params.id, 'reject'))
  }

  async revoke({ auth, response, params }: HttpContext) {
    const actor = await auth.getUserOrFail()
    return response.ok(await decideAdmission(this.admission, actor.id, params.id, 'revoke'))
  }
}
