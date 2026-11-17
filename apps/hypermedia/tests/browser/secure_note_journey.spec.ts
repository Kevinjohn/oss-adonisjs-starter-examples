import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
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
    await page.getByLabel('New note').fill('Remember this')
    await page.getByLabel('Current password').fill('WrongPassword!')
    const rejected = page.waitForResponse(
      (response) =>
        response.url().endsWith('/settings/secure-note/confirm') &&
        response.request().method() === 'POST'
    )
    await page.getByRole('button', { name: 'Confirm password' }).click()
    await rejected
    await page.getByText('The password is incorrect.').waitFor()
    const beforeSave = await db.from('secure_notes')
    assert.equal(beforeSave.length, 0)
    await page.goto('/settings/secure-note')
    await page.getByLabel('New note').fill('Remember this')
    await page.getByLabel('Current password').fill('SignupPass123!')
    await page.getByRole('button', { name: 'Confirm password' }).click()
    await page.getByRole('button', { name: 'Save confirmed note' }).click()
    await page.getByText('Saved note: Remember this').waitFor()
    const notes = await db.from('secure_notes').select('body')
    assert.equal(notes.length, 1)
    assert.equal(notes[0].body, 'Remember this')
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
    await page.getByText('The password is incorrect.').waitFor()
    assert.equal(await page.getByRole('button', { name: 'Save confirmed note' }).count(), 0)
    const unchanged = await db.from('secure_notes').first()
    assert.equal(unchanged.body, 'Remember this')
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
    await banner.getByText(`You are viewing as account ${customer.id}.`).waitFor()
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
