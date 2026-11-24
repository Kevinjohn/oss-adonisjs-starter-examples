# Checked JSON columns with Lucid

The starter apps use `@kevinjohn/adonisjs-lucid-checked-columns` to validate values read from a JSON column. The reading list stores its labels as JSON text and checks that every decoded value is an allowed label whenever Lucid hydrates a `ReadingItem`.

<!-- prettier-ignore-start -->

<!-- source: apps/api/app/models/reading_item.ts -->
```ts
import { BaseModel, column, scope } from '@adonisjs/lucid/orm'
import { isArrayOf, isOneOf, jsonColumn } from '@kevinjohn/adonisjs-lucid-checked-columns'

const isLabel = isOneOf(['work', 'personal', 'reference'] as const)
export type ReadingLabel = 'work' | 'personal' | 'reference'

export default class ReadingItem extends BaseModel {
  static table = 'reading_items'

  static forOwner = scope((query, userId: number) => query.where('user_id', userId))

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare title: string

  @column(jsonColumn('reading_items', 'labels', isArrayOf(isLabel)))
  declare labels: ReadingLabel[]
}
```

<!-- prettier-ignore-end -->

The controller passes the authenticated account ID to `ReadingItem.forOwner` through `withScopes`. The model owns the owner predicate, so other accounts’ rows are excluded before Lucid hydrates labels.

The migration uses a text column because the application serializes the value as JSON. The model decorator parses the stored text and checks it against the schema. Invalid JSON and values outside the schema raise a controlled hydration error. The controller returns a generic 500 for this reading-list failure and rethrows other errors to the framework handler.

Request validation is separate from persisted-data validation. Validate incoming values before saving them, then let the checked column protect later reads from malformed or manually changed database rows. See the runnable implementations in `apps/api`, `apps/hypermedia`, `apps/inertia-react`, and `apps/inertia-vue`.
