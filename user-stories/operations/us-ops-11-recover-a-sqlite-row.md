# US-OPS-11 — Recover a row from an API starter backup

As an API app operator, I want to verify a backup and recover a seeded row into a separate SQLite file so that I can check that a usable copy exists.

**Status:** Operator
**Access:** Local API starter operator with a migrated SQLite database, a fresh writable backup directory for the drill and a distinct restore target.
**Entry:** Follow the SQLite backup drill from `apps/api`.
**Documentation:** [Backup recovery drill](../../docs/cookbook/sqlite-backup.md).
**Source:** [backup.ts](../../apps/api/config/backup.ts), [adonisrc.ts](../../apps/api/adonisrc.ts)
**Coverage:** [sqlite_backup.spec.ts](../../apps/api/tests/functional/sqlite_backup.spec.ts)

## Acceptance criteria

- Set `DB_CONNECTION=sqlite` and point `SQLITE_BACKUP_DIRECTORY` at a fresh directory dedicated to this run. Verify and restore preparation each select the newest READY bundle by default. A dedicated directory keeps both commands on the bundle created in this drill.
- Seed the demo accounts, then run `node ace db:backup create`, `node ace db:backup verify`, and `node ace db:backup restore-prepare --target <file>` in order. Use a new destination outside the backup directory. Stop if any command fails.
- Open the staged file read-only and check for the seeded account from the recipe. The app continues to use its original database.

## User flow

```mermaid
flowchart TD
    A["Configure SQLite, seed the API starter and use a fresh backup directory"] --> B["Create and verify a backup bundle"]
    B --> C{"Bundle verifies?"}
    C -->|Create or verify fails| D["Read failure and stop the drill"]
    C -->|Yes| E["Prepare a separate restore file"]
    E -->|Prepared| F["Open the staged file read-only and check the seeded row"]
    E -->|Preparation fails| D
```

## Code flow

```mermaid
flowchart TD
    A["API adonisrc registers SQLite Backup provider and commands"] --> B["config/backup.ts reads SQLITE_BACKUP_DIRECTORY"]
    B --> C["Ace delegates create and verify to SQLite Backup"]
    C -->|Verified| D["Ace delegates restore-prepare with the selected target"]
    C -->|Failure| E["Package reports failure"]
    D -->|Prepared| F["Operator opens staged SQLite file read-only and checks row"]
    D -->|Failure| E
```

**Code references:** [adonisrc.ts](../../apps/api/adonisrc.ts), [backup.ts](../../apps/api/config/backup.ts), [sqlite_backup.spec.ts](../../apps/api/tests/functional/sqlite_backup.spec.ts).
