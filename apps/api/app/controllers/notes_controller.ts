import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { execute, type Operation } from '@kevinjohn/adonisjs-duplicate-request-guard'
import { authStrategy } from '#services/auth_strategy'
import { createNoteValidator } from '#validators/note'

const createNote: Operation<{ body: string }, undefined, { noteId: number }> = {
  name: 'notes.create',
  authorizeAccess: async ({ trx, actorId }) => {
    const user = await trx.from('users').where('id', actorId).first()
    if (!user) throw new Error('User no longer exists')
  },
  work: async ({ trx, actorId, payload }) => {
    const [noteId] = await trx.table('notes').insert({ user_id: actorId, body: payload.body })
    return { noteId }
  },
}

export default class NotesController {
  async store({ auth, request, response }: HttpContext) {
    const rawGuard = authStrategy() === 'session' ? 'web' : 'api'
    const user = auth.use(rawGuard).getUserOrFail()
    const [validationError, note] = await request.tryValidateUsing(createNoteValidator, {
      data: {
        body: request.input('body'),
        commandId: request.input('commandId'),
        requestKey: request.input('requestKey'),
      },
    })
    if (validationError) {
      return response.badRequest({ error: 'body, commandId, and requestKey are required strings' })
    }
    const { body, commandId, requestKey } = note
    const result = await execute(db.connection(), createNote, {
      actorId: String(user.id),
      scopeId: String(user.id),
      payload: { body },
      command: { commandId, requestKey },
    })
    return response.created(result)
  }
}
