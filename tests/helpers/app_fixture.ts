import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** File contents for a fixture app. `null` omits the named file. */
export type FileSpec = Record<string, string | Buffer | null>

export function writeFiles(directory: string, files: FileSpec): void {
  for (const [path, content] of Object.entries(files)) {
    const target = join(directory, path)
    rmSync(target, { force: true, recursive: true })
    if (content === null) continue
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
    chmodSync(target, 0o644)
  }
}

export function temporaryDirectory(prefix = 'app-test-'): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)))
}

export function appFiles(kit: string): FileSpec {
  return {
    'package.json': `${JSON.stringify(
      { name: kit, scripts: { test: 'node ace test' } },
      null,
      2
    )}\n`,
    'pnpm-workspace.yaml': 'allowBuilds: {}\n',
    'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
    '.env.example': 'APP_KEY=\n',
    'database/schema.ts': 'export class UserSchema {}\n',
    'tmp/.gitkeep': '',
  }
}

export class AppTestWorld {
  readonly directory = temporaryDirectory()
  readonly sandboxRoot = join(this.directory, 'sandbox')

  constructor() {
    mkdirSync(join(this.sandboxRoot, 'tmp'), { recursive: true })
  }

  cleanup(): void {
    rmSync(this.directory, { recursive: true, force: true })
  }
}
