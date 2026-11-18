import { defineConfig } from '@kevinjohn/adonisjs-sqlite-backup'
import env from '#start/env'

export default defineConfig({
  directory: env.get('SQLITE_BACKUP_DIRECTORY'),
})
