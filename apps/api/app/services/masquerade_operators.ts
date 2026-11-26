import { masqueradeOperatorEmails } from '#config/operators'

/**
 * Accounts whose email is listed in `MASQUERADE_OPERATOR_EMAILS` (comma-separated) may act as
 * other accounts. A missing or empty value means nobody. Tests add their own addresses here.
 */
export { masqueradeOperatorEmails }

export function isMasqueradeOperator(user: { email: string }) {
  return masqueradeOperatorEmails.has(user.email.toLowerCase())
}
