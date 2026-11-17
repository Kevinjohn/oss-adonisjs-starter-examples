import { BaseModel, column } from '@adonisjs/lucid/orm'
import { isArrayOf, isOneOf, jsonColumn } from '@kevinjohn/adonisjs-lucid-checked-columns'

const isLabel = isOneOf(['work', 'personal', 'reference'] as const)
export type ReadingLabel = 'work' | 'personal' | 'reference'

export default class ReadingItem extends BaseModel {
  static table = 'reading_items'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare title: string

  @column(jsonColumn('reading_items', 'labels', isArrayOf(isLabel)))
  declare labels: ReadingLabel[]
}
