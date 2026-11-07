/**
 * A pattern that matches the whole error message, for `assert.throws` and `assert.rejects`, which
 * otherwise accept any message containing the text.
 */
export function exactly(message: string): RegExp {
  return new RegExp(`^${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}
