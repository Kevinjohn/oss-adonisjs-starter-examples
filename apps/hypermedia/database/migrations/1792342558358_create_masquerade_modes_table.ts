import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'masquerade_modes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('authority_namespace', 128).notNullable()
      table.string('actor_id', 255).notNullable()
      table.string('actor_incarnation', 128).notNullable()
      // A primary key, not only a unique index, gives PostgreSQL logical replication a replica
      // identity, so UPDATEs succeed in databases with a FOR ALL TABLES publication.
      table.primary(
        ['authority_namespace', 'actor_id', 'actor_incarnation'],
        'masquerade_modes_owner_unique'
      )
      table.bigInteger('revision').notNullable()
      table.string('revision_nonce', 32).notNullable()
      table.string('state', 6).notNullable()
      table.string('access', 8).nullable()
      table.string('mode_id', 36).notNullable()
      table.string('last_transition_id', 36).notNullable()
      table.string('target_id', 255).nullable()
      table.string('target_incarnation', 128).nullable()
      table.string('actor_stamp_hash', 64).nullable()
      table.string('target_stamp_hash', 64).nullable()
      table.text('reason').nullable()
      table.string('started_at', 24).nullable()
      table.string('expires_at', 24).nullable()
      table.string('updated_at', 24).notNullable()
      table.index(['state', 'expires_at', 'updated_at'], 'masquerade_modes_expiry_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
