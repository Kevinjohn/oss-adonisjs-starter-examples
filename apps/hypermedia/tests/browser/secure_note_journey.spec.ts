import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import SecureNotesController from '#controllers/secure_notes_controller'
import { masqueradeOperatorEmails } from '#services/masquerade_operators'
import { setupAccountDatabase } from '#tests/helpers/account_database'

const origin = process.env.APP_URL!

test.group('secure note confirmation', (group) => {
  group.each.setup(async () => {
    const cleanup = await setupAccountDatabase()
    return async () => {
      masqueradeOperatorEmails.clear()
      await cleanup()
    }
  })

  test('a signed-in user confirms a password before a durable note write', async ({
    visit,
    assert,
  }) => {
    const page = await visit('/signup')
    await page.getByLabel('Email').fill('note@example.test')
    await page.getByLabel('Password', { exact: true }).fill('SignupPass123!')
    await page.getByLabel('Confirm password').fill('SignupPass123!')
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForURL('**/dashboard')
    await page.goto('/settings/secure-note')
    await page.getByLabel('New note').fill('Remember  this')
    await page.getByLabel('Current password').fill('WrongPassword!')
    const rejected = page.waitForResponse(
      (response) =>
        response.url().endsWith('/settings/secure-note/confirm') &&
        response.request().method() === 'POST'
    )
    await page.getByRole('button', { name: 'Confirm password' }).click()
    await rejected
    await page.getByText('The password is incorrect.', { exact: false }).waitFor()
    const beforeSave = await db.from('secure_notes')
    assert.equal(beforeSave.length, 0)
    await page.goto('/settings/secure-note')
    await page.getByLabel('New note').fill('Remember  this')
    await page.getByLabel('Current password').fill('SignupPass123!')
    await page.getByRole('button', { name: 'Confirm password' }).click()
    await page.getByRole('button', { name: 'Save confirmed note' }).click()
    await page.getByText('Saved note: Remember this', { exact: false }).waitFor()
    const notes = await db.from('secure_notes').select('body')
    assert.equal(notes.length, 1)
    assert.equal(notes[0].body, 'Remember  this')
    const [confirmation] = await db
      .from('password_confirmations')
      .select('sign_in_id', 'consumed_at')
    assert.isNumber(confirmation.sign_in_id)
    assert.isNotNull(confirmation.consumed_at)
    await page.goto('/settings/secure-note')
    assert.equal(await page.getByRole('button', { name: 'Save confirmed note' }).count(), 0)
    await page.getByLabel('New note').fill('Second note')
    await page.getByLabel('Current password').fill('SignupPass123!')
    await page.getByRole('button', { name: 'Confirm password' }).click()
    await page.getByRole('button', { name: 'Save confirmed note' }).waitFor()
    await page.getByLabel('New note').fill('Third note')
    await page.getByLabel('Current password').fill('WrongPassword!')
    await page.getByRole('button', { name: 'Confirm password' }).click()
    await page.getByText('The password is incorrect.', { exact: false }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Save confirmed note' }).count(), 0)
    const unchanged = await db.from('secure_notes').first()
    assert.equal(unchanged.body, 'Remember  this')
  })

  test('invalid inputs preserve the draft and an expired proof clears it without saving', async ({
    visit,
    assert,
  }) => {
    const password = 'SignupPass123!'
    const user = await User.create({ email: 'expired-note@example.test', password })
    const page = await visit('/login')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard')
    await page.goto('/settings/secure-note')

    await page.getByLabel('New note').fill('Pending note')
    await page.getByLabel('Current password').fill(password)
    await page.getByRole('button', { name: 'Confirm password' }).click()
    const save = page.getByRole('button', { name: 'Save confirmed note' })
    await save.waitFor()
    const [draft] = await db.from('pending_secure_notes')
    assert.equal(draft.body, 'Pending note')

    const body = page.getByLabel('New note')
    await body.evaluate((input) => input.removeAttribute('maxlength'))
    await body.fill('x'.repeat(501))
    await page.getByLabel('Current password').fill(password)
    await page.getByRole('button', { name: 'Confirm password' }).click()
    await page
      .getByText('Enter a note of 1 to 500 characters and your password.', { exact: false })
      .waitFor()
    assert.deepEqual(await db.from('pending_secure_notes'), [draft])
    assert.lengthOf(await db.from('password_confirmations'), 1)

    await page.locator('input[name="confirmationId"]').evaluate((input) => {
      input.setAttribute('value', '')
    })
    await save.click()
    await page.getByText('Confirm your password again before saving.', { exact: true }).waitFor()
    assert.deepEqual(await db.from('pending_secure_notes'), [draft])

    await db
      .from('password_confirmations')
      .where('id', draft.confirmation_id)
      .update({ expires_at: 1 })
    await save.click()
    await page
      .getByText('Confirmation expired or was already used. Confirm your password again.', {
        exact: false,
      })
      .waitFor()
    assert.lengthOf(await db.from('pending_secure_notes'), 0)
    assert.lengthOf(await db.from('secure_notes'), 0)
    const proof = await db.from('password_confirmations').where('id', draft.confirmation_id).first()
    assert.isNull(proof.consumed_at)
  })

  test('signing out clears an unspent draft before the same account signs in again', async ({
    visit,
    assert,
  }) => {
    const password = 'SignupPass123!'
    const user = await User.create({ email: 'signout-note@example.test', password })
    const page = await visit('/login')

    async function signIn() {
      await page.getByLabel('Email').fill(user.email)
      await page.getByLabel('Password').fill(password)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL('**/dashboard')
      await page.goto('/settings/secure-note')
    }

    async function confirmNote(body: string) {
      await page.getByLabel('New note').fill(body)
      await page.getByLabel('Current password').fill(password)
      await page.getByRole('button', { name: 'Confirm password' }).click()
      await page.getByText(`Confirmed note: ${body}`, { exact: true }).waitFor()
    }

    async function saveNote(body: string) {
      await page.getByRole('button', { name: 'Save confirmed note' }).click()
      await page.getByText(`Saved note: ${body}`, { exact: true }).waitFor()
    }

    await signIn()
    await confirmNote('Keep this saved note')
    await saveNote('Keep this saved note')
    const savedNotes = await db.from('secure_notes')
    assert.lengthOf(savedNotes, 1)

    await confirmNote('Discard this pending note')
    const pendingNotes = await db.from('pending_secure_notes')
    assert.lengthOf(pendingNotes, 1)
    const pendingNote = pendingNotes[0]
    assert.equal(pendingNote.body, 'Discard this pending note')
    const confirmations = await db
      .from('password_confirmations')
      .where('id', pendingNote.confirmation_id)
    assert.lengthOf(confirmations, 1)
    assert.equal(confirmations[0].sign_in_id, pendingNote.sign_in_id)
    assert.isNull(confirmations[0].consumed_at)

    await page.getByRole('button', { name: 'Log out' }).click()
    await page.waitForURL('**/login')
    await signIn()
    await page.getByRole('heading', { name: 'Secure note' }).waitFor()
    await page.getByText('Saved note: Keep this saved note', { exact: true }).waitFor()
    assert.equal(
      await page.getByText('Confirmed note: Discard this pending note', { exact: false }).count(),
      0
    )
    assert.equal(await page.getByRole('button', { name: 'Save confirmed note' }).count(), 0)
    assert.lengthOf(
      await db.from('pending_secure_notes').where('sign_in_id', pendingNote.sign_in_id),
      0
    )
    assert.lengthOf(
      await db.from('password_confirmations').where('id', pendingNote.confirmation_id),
      0
    )
    assert.deepEqual(await db.from('secure_notes'), savedNotes)

    await confirmNote('Save from the new sign-in')
    await saveNote('Save from the new sign-in')
    assert.deepEqual(await db.from('secure_notes').select('body'), [
      { body: 'Save from the new sign-in' },
    ])
  })

  test('a stale tab cannot save or discard a newer confirmation', async ({ visit, assert }) => {
    const password = 'SignupPass123!'
    const page = await visit('/signup')
    await page.getByLabel('Email').fill('two-tabs@example.test')
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForURL('**/dashboard')

    await page.goto('/settings/secure-note')
    await page.getByLabel('New note').fill('Note from the first tab')
    await page.getByLabel('Current password').fill(password)
    await page.getByRole('button', { name: 'Confirm password' }).click()
    await page.getByText('Confirmed note: Note from the first tab', { exact: false }).waitFor()

    const secondTab = await page.context().newPage()
    try {
      await secondTab.goto(`${origin}/settings/secure-note`)
      await secondTab.getByLabel('New note').fill('Note from the second tab')
      await secondTab.getByLabel('Current password').fill(password)
      await secondTab.getByRole('button', { name: 'Confirm password' }).click()
      await secondTab
        .getByText('Confirmed note: Note from the second tab', { exact: false })
        .waitFor()

      await page.getByText('Confirmed note: Note from the first tab', { exact: false }).waitFor()
      await page.getByRole('button', { name: 'Save confirmed note' }).click()
      await page.getByText('Confirm your password again before saving.', { exact: false }).waitFor()
      assert.lengthOf(await db.from('secure_notes'), 0)

      await secondTab.getByRole('button', { name: 'Save confirmed note' }).click()
      await secondTab.getByText('Saved note: Note from the second tab', { exact: false }).waitFor()
      const notes = await db.from('secure_notes').select('body')
      assert.deepEqual(notes, [{ body: 'Note from the second tab' }])
    } finally {
      await secondTab.close()
    }
  })

  test('account deletion clears a pending secure note before the next sign-in', async ({
    visit,
    assert,
  }) => {
    const password = 'SignupPass123!'
    const firstUser = await User.create({ email: 'first-note@example.test', password })
    await User.create({ email: 'next-note@example.test', password })
    const page = await visit('/login')
    await page.getByLabel('Email').fill(firstUser.email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard')
    await page.goto('/settings/secure-note')
    await page.getByLabel('New note').fill('Private pending note')
    await page.getByLabel('Current password').fill(password)
    await page.getByRole('button', { name: 'Confirm password' }).click()
    await page.getByText('Confirmed note: Private pending note', { exact: false }).waitFor()

    await page.goto('/account/delete')
    await page.getByRole('button', { name: 'Delete my account' }).click()
    await page.waitForURL('**/login')
    assert.lengthOf(await db.from('account_sessions').where('user_id', firstUser.id), 0)
    assert.lengthOf(await db.from('pending_secure_notes'), 0)

    await page.getByLabel('Email').fill('next-note@example.test')
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard')
    await page.goto('/settings/secure-note')
    await page.getByLabel('New note').waitFor()
    assert.equal(await page.getByText('Private pending note', { exact: false }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Save confirmed note' }).count(), 0)
  })

  test('a delayed save response cannot erase a newer confirmation', async ({ visit, assert }) => {
    const password = 'SignupPass123!'
    const page = await visit('/signup')
    await page.getByLabel('Email').fill('overlapping-notes@example.test')
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForURL('**/dashboard')

    await page.goto('/settings/secure-note')
    await page.getByLabel('New note').fill('First confirmed note')
    await page.getByLabel('Current password').fill(password)
    await page.getByRole('button', { name: 'Confirm password' }).click()
    await page.getByText('Confirmed note: First confirmed note', { exact: false }).waitFor()

    const secondTab = await page.context().newPage()
    const saveFinished = Promise.withResolvers<void>()
    const releaseResponse = Promise.withResolvers<void>()
    const update = SecureNotesController.prototype.update
    SecureNotesController.prototype.update = async function (ctx) {
      try {
        const result = await update.call(this, ctx)
        // Pause after the controller saves the note and before session middleware commits.
        saveFinished.resolve()
        await releaseResponse.promise
        return result
      } catch (error) {
        saveFinished.reject(error)
        throw error
      }
    }

    const firstResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/settings/secure-note' &&
        response.request().method() === 'POST'
    )
    const firstSave = page.getByRole('button', { name: 'Save confirmed note' }).click()
    void firstSave.catch(saveFinished.reject)
    try {
      await Promise.race([
        saveFinished.promise,
        firstResponse.then((response) => {
          throw new Error(`Save responded with ${response.status()} before reaching the barrier`)
        }),
      ])
      assert.deepEqual(await db.from('secure_notes').select('body'), [
        { body: 'First confirmed note' },
      ])
      await secondTab.goto(`${origin}/settings/secure-note`)
      await secondTab.getByLabel('New note').fill('Second confirmed note')
      await secondTab.getByLabel('Current password').fill(password)
      await secondTab.getByRole('button', { name: 'Confirm password' }).click()
      await secondTab.getByText('Confirmed note: Second confirmed note', { exact: false }).waitFor()

      releaseResponse.resolve()
      SecureNotesController.prototype.update = update
      await firstSave
      const response = await firstResponse
      assert.oneOf(response.status(), [302, 303])
      await page.getByText('Saved note: First confirmed note', { exact: false }).waitFor()

      await secondTab.reload()
      await secondTab.getByLabel('New note').waitFor()
      assert.equal(
        await secondTab
          .getByText('Confirmed note: Second confirmed note', { exact: false })
          .count(),
        1
      )
      await secondTab.getByRole('button', { name: 'Save confirmed note' }).click()
      await secondTab.getByText('Saved note: Second confirmed note', { exact: false }).waitFor()
      assert.deepEqual(await db.from('secure_notes').select('body'), [
        { body: 'Second confirmed note' },
      ])
    } finally {
      releaseResponse.resolve()
      SecureNotesController.prototype.update = update
      await secondTab.close()
    }
  })

  test('a masquerading operator cannot confirm a sensitive note action', async ({
    visit,
    assert,
  }) => {
    const password = 'MasqueradePass123!'
    masqueradeOperatorEmails.add('operator@example.test')
    await User.create({ email: 'operator@example.test', password })
    const customer = await User.create({ email: 'customer@example.test', password })

    const page = await visit('/login')
    await page.getByLabel('Email').fill('operator@example.test')
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('heading', { name: 'Your account' }).waitFor()
    await page.goto('/masquerade/accounts')
    await page.getByRole('button', { name: 'Act as customer@example.test' }).click()
    const banner = page.getByRole('status').filter({ hasText: 'You are viewing as account' })
    await banner.getByText(`You are viewing as account ${customer.id}.`, { exact: false }).waitFor()
    await page.goto('/masquerade/accounts')
    const context = await page
      .locator('input[name="_masqueradeContext"]')
      .first()
      .getAttribute('value')
    const csrf = await page.locator('input[name="_csrf"]').first().getAttribute('value')
    assert.isString(context)
    assert.isString(csrf)

    const response = await page.request.post(`${origin}/settings/secure-note/confirm`, {
      form: { body: 'Must not save', password, _masqueradeContext: context!, _csrf: csrf! },
    })
    assert.equal(response.status(), 403)
    const payload = (await response.json()) as {
      errors: Array<{ code: string; blockedBy?: string }>
    }
    assert.equal(payload.errors[0]?.code, 'E_MASQUERADE_ACTION_BLOCKED')
    assert.equal(payload.errors[0]?.blockedBy, 'sensitive')
    assert.lengthOf(await db.from('secure_notes'), 0)
    assert.lengthOf(await db.from('password_confirmations'), 0)
  })
})
