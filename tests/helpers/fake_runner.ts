import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CommandOptions, CommandRunner } from '../../src/command_runner.ts'

export interface FakeCall {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

/**
 * A command runner that records calls and imitates what the real commands write: install writes
 * `node_modules/` and the lockfile, `generate:key` rewrites `.env.example`, `migration:run`
 * creates the SQLite file and regenerates `database/schema.ts`, `pack` writes the archive.
 * `effects` adds extra writes per command, keyed by the last argument.
 */
export function fakeRunner(effects: Record<string, (options: CommandOptions) => void> = {}) {
  const calls: FakeCall[] = []
  const started: string[] = []
  const stopped: string[] = []
  const runner: CommandRunner = {
    async run(command, args, options) {
      calls.push({ command, args, cwd: options.cwd, env: options.env })
      const { cwd } = options
      const last = args.at(-1)!
      if (args[0] === 'install') {
        write(join(cwd, 'node_modules/.modules.yaml'), 'installed\n')
        if (!args.includes('--frozen-lockfile') || !existsSync(join(cwd, 'pnpm-lock.yaml'))) {
          write(join(cwd, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n# regenerated\n")
        }
      }
      if (args.includes('generate:key')) write(join(cwd, '.env.example'), 'APP_KEY=rewritten\n')
      if (args.includes('migration:run')) {
        write(join(cwd, 'tmp/db.sqlite3'), 'sqlite')
        write(join(cwd, 'database/schema.ts'), 'export class RegeneratedSchema {}\n')
      }
      if (args.includes('pack')) write(args[args.indexOf('--out') + 1], 'archive bytes')
      effects[last]?.(options)
    },
    start(command, args) {
      started.push([command, ...args].join(' '))
      return {
        async stop() {
          stopped.push([command, ...args].join(' '))
        },
      }
    },
  }
  return { runner, calls, started, stopped }
}
