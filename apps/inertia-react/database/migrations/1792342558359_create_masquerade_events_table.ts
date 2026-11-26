import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'masquerade_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('id', 36).primary()
      table.string('mode_id', 36).nullable()
      table.string('authority_namespace', 128).notNullable()
      table.string('actor_id', 255).notNullable()
      table.string('actor_incarnation', 128).notNullable()
      table.string('target_id', 255).nullable()
      table.string('target_incarnation', 128).nullable()
      table.string('at', 24).notNullable()
      table.string('kind', 32).notNullable()
      table.string('outcome_code', 128).notNullable()
      table.string('access', 8).nullable()
      table.bigInteger('revision').notNullable()
      table.text('reason').nullable()
      table.index(['at', 'id'], 'masquerade_events_retention_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
