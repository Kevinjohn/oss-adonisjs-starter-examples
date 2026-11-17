import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pending_secure_notes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table
        .integer('sign_in_id')
        .unsigned()
        .primary()
        .references('id')
        .inTable('account_sessions')
        .onDelete('CASCADE')
      table
        .string('confirmation_id', 36)
        .notNullable()
        .unique()
        .references('id')
        .inTable('password_confirmations')
        .onDelete('CASCADE')
      table.string('body', 500).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
