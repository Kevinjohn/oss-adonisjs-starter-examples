# Recover a row from an API starter backup

The API starter includes SQLite Backup 0.3.1. This local drill creates a backup of its SQLite database, verifies the bundle, and reads a seeded account from a separate restore file. Run the commands from `apps/api` after completing the [API setup](../../apps/api/README.md#run-it) with `DB_CONNECTION=sqlite`.

Seed the demo accounts. Use a fresh directory for this run so the newest bundle is the one you just created.

```sh
node ace db:seed
drill=$(mktemp -d "$PWD/tmp/backup-drill.XXXXXX")
export SQLITE_BACKUP_DIRECTORY="$drill/bundles"
node ace db:backup create
node ace db:backup verify
node ace db:backup restore-prepare --target "$drill/restored.sqlite3"
```

With the starter’s default SQLite journal mode, `create` warns that other writers wait during the copy.

Open the staged file read-only and query the account created by the demo seeder. The command should print `alice@example.com`. The application continues using its original database.

```sh
node --input-type=module - "$drill/restored.sqlite3" <<'JS'
import Database from 'better-sqlite3'

const restored = new Database(process.argv[2], { readonly: true })
const account = restored.prepare('SELECT email FROM users WHERE email = ?').get('alice@example.com')
console.log(account.email)
restored.close()
JS
```

The starter reads the backup directory from its environment. Leaving it unset disables backups. For another restore, choose a new target filename outside the bundle directory.

<!-- prettier-ignore-start -->

<!-- source: apps/api/config/backup.ts -->
```ts
export default defineConfig({
  directory: env.get('SQLITE_BACKUP_DIRECTORY'),
})
```

<!-- prettier-ignore-end -->
