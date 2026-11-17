import { test } from '@japa/runner'
import User from '#models/user'
import { setupAccountDatabase } from '#tests/helpers/account_database'

const password = 'ReadingListPass123!'

test.group('reading list in the browser', (group) => {
  group.each.setup(setupAccountDatabase)

  test('a signed-in account submits the reading list form', async ({ visit }) => {
    await User.create({ email: 'reader@example.test', password })
    const page = await visit('/login')
    await page.getByLabel('Email').fill('reader@example.test')
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('heading', { name: 'Your account' }).waitFor()

    await page.getByRole('link', { name: 'Reading list' }).click()
    await page.getByLabel('Title').fill('Lucid guide')
    await page.getByLabel('Label').selectOption('reference')
    await page.getByRole('button', { name: 'Add item' }).click()
    await page.getByText('Lucid guide — reference').waitFor()
  })
})
