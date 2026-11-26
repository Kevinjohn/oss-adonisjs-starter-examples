import { test } from '@japa/runner'
import { oldInputValidator } from '#validators/old_input'

test('preserves only safe old input while malformed siblings and secrets are discarded', async ({
  assert,
}) => {
  assert.deepEqual(
    await oldInputValidator.validate({
      fullName: null,
      email: 'person@example.test',
      password: 'never-flash-this',
      newPassword: 'never-flash-this-either',
      unexpected: 'discard',
    }),
    { fullName: '', email: 'person@example.test' }
  )

  assert.deepEqual(
    await oldInputValidator.validate({
      fullName: ['invalid'],
      email: 'valid@example.test',
    }),
    { email: 'valid@example.test' }
  )

  assert.deepEqual(
    await oldInputValidator.validate({
      fullName: 'a'.repeat(321),
      email: { value: 'invalid@example.test' },
    }),
    {}
  )
  assert.deepEqual(await oldInputValidator.validate({}), {})
})
