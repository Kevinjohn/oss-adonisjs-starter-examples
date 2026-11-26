import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'

const bodyLimit = 8 * 1024
const commonKeys = ['_masqueradeContext', '_csrf']

const validControlForm = vine.createRule<readonly string[]>((value, keys, field) => {
  const request = field.meta.request as HttpContext['request']
  // The object schema checks the body type before invoking this rule.
  const body = value as Record<string, unknown>
  if (!hasValidFormFraming(request, body)) {
    field.report('The form body is invalid.', 'controlFormFraming', field)
    return
  }

  if (Object.keys(body).some((key) => !keys.includes(key))) {
    field.report('The form contains an unexpected field.', 'controlFormKeys', field)
  }
})

function controlForm(keys: readonly string[]) {
  // Preserve the field values for the package to validate and audit after it checks the actor.
  return vine.withMetaData<{ request: HttpContext['request'] }>().create({
    body: vine.object({}).allowUnknownProperties<unknown>().use(validControlForm(keys)),
  })
}

export const startMasqueradeValidator = controlForm([
  ...commonKeys,
  'targetId',
  'reason',
  'durationSeconds',
  'access',
])

export const stopMasqueradeValidator = controlForm(commonKeys)

function hasValidFormFraming(
  request: HttpContext['request'],
  body: Record<string, unknown>
): boolean {
  const contentType = request.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  // Inertia's <Form> posts JSON; a native form posts URL-encoded fields.
  const inertiaJson = contentType === 'application/json' && request.header('x-inertia') === 'true'
  if (contentType !== 'application/x-www-form-urlencoded' && !inertiaJson) return false

  const raw = request.raw()
  if (raw !== null) return Buffer.byteLength(raw, 'utf8') <= bodyLimit

  const contentLength = request.header('content-length')
  const zeroLength = contentLength === '0' && request.header('transfer-encoding') === undefined
  const unframedEmpty = !request.hasBody() && contentLength === undefined
  return Object.keys(body).length === 0 && (zeroLength || unframedEmpty)
}
