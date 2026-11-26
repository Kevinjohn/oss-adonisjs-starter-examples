import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import { errors } from '@kevinjohn/adonisjs-masquerade'
import type { MasqueradeErrorCode, StartInput, StopInput } from '@kevinjohn/adonisjs-masquerade'
import { isMasqueradeRequestError } from '@kevinjohn/adonisjs-masquerade/http'
import type { MasqueradeRuntime } from '@kevinjohn/adonisjs-masquerade/masquerade_provider'

type FormAction = 'start' | 'stop'
type FormBody = Record<string, unknown>
export type MasqueradeFormFlash =
  { type: 'success'; action: 'started' | 'stopped' } | { type: 'error'; code: MasqueradeErrorCode }

const invalidInput = { __invalidHttpInput: true }

@inject()
export default class MasqueradeForm {
  constructor(private readonly context: HttpContext) {}

  async transition(action: FormAction, body: FormBody | undefined): Promise<MasqueradeFormFlash> {
    const { containerResolver, request } = this.context
    try {
      const runtime = (await containerResolver.make('masquerade.runtime')) as MasqueradeRuntime
      // Like the package controller, control only from a route on the operator's raw guard.
      if (runtime.selectGuard(this.context).kind !== 'raw')
        throw new errors.E_MASQUERADE_UNAVAILABLE()

      // The marker has no control fields, so the package records the denied outcome.
      if (action === 'start') {
        const input = body ? startInput(request, body) : invalidInput
        await runtime.service.start(this.context, input as StartInput)
      } else {
        const input = body ? stopInput(request, body) : invalidInput
        await runtime.service.stop(this.context, input as StopInput)
      }

      return { type: 'success', action: action === 'start' ? 'started' : 'stopped' }
    } catch (error) {
      if (!isMasqueradeRequestError(error)) throw error
      return { type: 'error', code: error.code }
    }
  }
}

function startInput(request: HttpContext['request'], body: FormBody): StartInput {
  return {
    targetId: body.targetId as StartInput['targetId'],
    reason: body.reason as StartInput['reason'],
    // The body parser turns blank fields into null; a blank optional field takes its default.
    ...(isBlank(body.access) ? {} : { access: body.access as StartInput['access'] }),
    ...(isBlank(body.durationSeconds)
      ? {}
      : { durationSeconds: coerceFormDuration(body.durationSeconds) }),
    ...stopInput(request, body),
  }
}

function stopInput(request: HttpContext['request'], body: FormBody): StopInput {
  const header = request.header('X-Masquerade-Context')
  const hidden = body._masqueradeContext
  if (header !== undefined && hidden !== undefined && header !== hidden) {
    return { expectedContext: '0.' + '0'.repeat(32) }
  }
  const token = header ?? hidden
  return { expectedContext: typeof token === 'string' ? token : '' }
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null
}

function coerceFormDuration(value: unknown): StartInput['durationSeconds'] {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value))
    return value as StartInput['durationSeconds']
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : (value as unknown as StartInput['durationSeconds'])
}
