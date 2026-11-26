import env from '#start/env'

export const masqueradeOperatorEmails = new Set(
  (env.get('MASQUERADE_OPERATOR_EMAILS') ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
)
