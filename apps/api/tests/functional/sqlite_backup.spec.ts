import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { promisify } from 'node:util'
import { test } from '@japa/runner'
import User from '#models/user'
import env from '#start/env'
import { truncateDatabase } from '#tests/helpers/database'

test.group('SQLite backup', (group) => {
  group.each.setup(truncateDatabase)

  test('verifies a backup and reads the original account from a staged restore', async ({
    assert,
    cleanup,
  }) => {
    const scratch = await mkdtemp(join(tmpdir(), 'api-sqlite-backup-'))
    cleanup(() => rm(scratch, { recursive: true, force: true }))
    const target = join(scratch, 'recovered.sqlite3')
    const backup = (...args: string[]) =>
      promisify(execFile)(process.execPath, ['ace', 'db:backup', ...args], {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DB_CONNECTION: 'sqlite',
          SQLITE_BACKUP_DIRECTORY: join(scratch, 'backups'),
        },
      })

    const user = await User.create({ email: 'diana@example.test', password: 'password123' })
    await backup('create')
    user.email = 'updated.diana@example.test'
    await user.save()
    const verified = await backup('verify')
    assert.match(verified.stdout, /Bundle .* verified/)
    await backup('restore-prepare', '--target', target)

    const staged = new DatabaseSync(target, { readOnly: true })
    try {
      const row = staged.prepare('SELECT email FROM users WHERE id = ?').get(user.id)
      assert.equal(row?.email, 'diana@example.test')
    } finally {
      staged.close()
    }
    const liveUser = await User.findOrFail(user.id)
    assert.equal(liveUser.email, 'updated.diana@example.test')
  }).skip(env.get('DB_CONNECTION') !== 'sqlite', 'The backup command uses a SQLite database')
})
