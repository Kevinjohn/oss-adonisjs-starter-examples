import { test } from '@japa/runner'
import { filterOldInput } from '#services/safe_old_input'

test('validation old input retains fullName and email independently up to 320 characters', ({
  assert,
}) => {
  const input = {
    fullName: 'n'.repeat(320),
    email: 'e'.repeat(320),
    password: 'SignupPass123!',
    passwordConfirmation: 'SignupPass123!',
    currentPassword: 'CurrentPass123!',
    cancelCurrentPassword: 'CurrentPass123!',
    _csrf: 'secret-token',
    extra: 'unexpected value',
    unknown: 'unknown value',
  }

  const oldInput = filterOldInput({
    ...input,
    nonString: { value: 'nested' },
  })

  assert.deepEqual(oldInput, { fullName: input.fullName, email: input.email })

  for (const field of ['fullName', 'email'] as const) {
    const tooLong = filterOldInput({
      [field]: 'x'.repeat(321),
    })
    assert.notProperty(tooLong, field)
  }

  assert.notProperty(oldInput, 'password')
  assert.notProperty(oldInput, 'passwordConfirmation')
  assert.notProperty(oldInput, 'currentPassword')
  assert.notProperty(oldInput, 'cancelCurrentPassword')
  assert.notProperty(oldInput, '_csrf')
  assert.notProperty(oldInput, 'unknown')
  assert.notProperty(oldInput, 'nonString')
})

test('validation old input omits unsupported object values', ({ assert }) => {
  for (const field of ['fullName', 'email'] as const) {
    const oldInput = filterOldInput({
      [field]: { value: 'nested' },
    })
    assert.notProperty(oldInput, field)
  }
})

test('safe old input distinguishes absent fields from cleared fields', ({ assert }) => {
  assert.deepEqual(filterOldInput({}), {})
  assert.deepEqual(filterOldInput({ fullName: null, email: '' }), { fullName: '', email: '' })
  assert.deepEqual(filterOldInput({ fullName: '', email: null }), { fullName: '', email: '' })
  assert.deepEqual(filterOldInput({ fullName: undefined, email: 42, password: null }), {})
})
