import { SandboxError } from './errors.ts'
import { type Git } from './git.ts'

const MIGRATIONS = 'database/migrations/'

interface Migration {
  /** Path relative to `database/migrations/`. */
  file: string
  prefix: bigint
}

function migrationsIn(git: Git, commit: string): Migration[] {
  return git
    .list(['ls-tree', '-r', '-z', '--name-only', commit, '--', MIGRATIONS])
    .map((path) => path.slice(MIGRATIONS.length))
    .filter((file) => /\.(ts|js)$/.test(file))
    .map((file) => {
      const digits = /^(\d+)/.exec(file.split('/').pop()!)
      return { file, prefix: digits ? BigInt(digits[1]) : 0n }
    })
}

/**
 * Specification 6.7: every migration a package adds must have a larger numeric prefix than the
 * largest one in its parent tree (0 when the parent has none).
 */
export function checkMigrationOrder(
  git: Git,
  options: { packageName: string; kit: string; parent: string; commit: string }
): void {
  const parentMigrations = migrationsIn(git, options.parent)
  const parentFiles = new Set(parentMigrations.map((migration) => migration.file))
  let last: Migration | undefined
  for (const migration of parentMigrations) {
    if (
      !last ||
      migration.prefix > last.prefix ||
      (migration.prefix === last.prefix && migration.file > last.file)
    ) {
      last = migration
    }
  }
  const max = last?.prefix ?? 0n

  for (const migration of migrationsIn(git, options.commit)) {
    if (parentFiles.has(migration.file) || migration.prefix > max) continue
    throw new SandboxError(
      `${options.packageName} adds ${MIGRATIONS}${migration.file} (${options.kit}), which sorts before ${last ? `${MIGRATIONS}${last.file}` : 'nothing'}.\n` +
        `Rename it to a prefix above ${max} before it is first run (runbook 16.4).`
    )
  }
}
