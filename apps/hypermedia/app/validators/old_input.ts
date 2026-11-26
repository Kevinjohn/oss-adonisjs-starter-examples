import vine from '@vinejs/vine'
import { filterOldInput } from '#services/safe_old_input'

/**
 * Error recovery accepts malformed fields so each safe sibling can still be preserved.
 * The transformation keeps only bounded strings from the non-secret field allowlist.
 */
export const oldInputValidator = vine.create(
  vine
    .object({
      fullName: vine.string().optional(),
      email: vine.string().optional(),
    })
    .parse((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value
      return filterOldInput(value as Record<string, unknown>)
    })
)
