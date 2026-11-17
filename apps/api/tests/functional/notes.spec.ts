import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import { truncateDatabase } from '#tests/helpers/database'
import { grantAdmittedOwner } from '#tests/helpers/admission'

test.group('guarded notes', (group) => {
  group.each.setup(truncateDatabase)

  test('the same command returns its first note and writes once for the raw account', async ({
    assert,
    client,
  }) => {
    const user = await User.create({ email: 'notes@example.test', password: 'NotesPass123!' })
    await grantAdmittedOwner(user)
    const token = await User.accessTokens.create(user)
    const bearer = token.value!.release()
    const input = { body: 'Remember the meeting', commandId: 'notes-1', requestKey: 'attempt-1' }
    const first = await client.post('/api/v1/notes').bearerToken(bearer).json(input)
    const replay = await client.post('/api/v1/notes').bearerToken(bearer).json(input)

    assert.equal(first.status(), 201)
    assert.equal(replay.status(), 201)
    assert.isFalse(first.body().replayed)
    assert.isAbove(first.body().result.noteId, 0)
    assert.deepEqual(replay.body(), { replayed: true, result: first.body().result })
    const otherUser = await User.create({
      email: 'other-notes@example.test',
      password: 'NotesPass123!',
    })
    await grantAdmittedOwner(otherUser)
    const otherToken = await User.accessTokens.create(otherUser)
    const other = await client
      .post('/api/v1/notes')
      .bearerToken(otherToken.value!.release())
      .json(input)
    assert.equal(other.status(), 201)
    assert.isFalse(other.body().replayed)
    assert.notEqual(other.body().result.noteId, first.body().result.noteId)
    assert.deepEqual(await db.from('notes').select('id', 'user_id', 'body'), [
      { id: first.body().result.noteId, user_id: user.id, body: input.body },
      { id: other.body().result.noteId, user_id: otherUser.id, body: input.body },
    ])
    const receiptCount = await db.from('request_receipts').count('* as total')
    assert.equal(Number(receiptCount[0].total), 2)
  })
})
