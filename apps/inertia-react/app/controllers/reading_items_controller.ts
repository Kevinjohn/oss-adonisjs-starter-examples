import ReadingItem from '#models/reading_item'
import { readingItemValidator } from '#validators/reading_item'
import type { HttpContext } from '@adonisjs/core/http'
import { errors } from '@kevinjohn/adonisjs-lucid-checked-columns'

export default class ReadingItemsController {
  async index({ auth, inertia, response }: HttpContext) {
    const user = auth.use('web').getUserOrFail()
    let rows: ReadingItem[]
    try {
      rows = await ReadingItem.query()
        .withScopes((scopes) => scopes.forOwner(user.id))
        .orderBy('id', 'desc')
    } catch (error) {
      if (
        error instanceof errors.E_INVALID_PERSISTED_JSON &&
        error.table === ReadingItem.table &&
        error.column === 'labels'
      ) {
        return response.internalServerError('Reading list unavailable')
      }
      throw error
    }
    const items = rows.map(({ id, title, labels }) => ({ id, title, labels }))
    return inertia.render('reading_items', { items })
  }

  async store({ auth, request, response }: HttpContext) {
    const user = auth.use('web').getUserOrFail()
    const { title, label } = await request.validateUsing(readingItemValidator)
    await ReadingItem.create({ userId: user.id, title, labels: [label] })
    return response.redirect('/reading-items')
  }
}
