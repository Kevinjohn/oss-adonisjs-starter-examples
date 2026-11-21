import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CommandRunner } from '../../src/command_runner.ts'

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
 * A command runner that records calls and imitates the files app setup commands write.
 */
export function fakeRunner() {
  const calls: FakeCall[] = []
  const started: string[] = []
  const stopped: string[] = []
  const runner: CommandRunner = {
    async run(command, args, options) {
      calls.push({ command, args, cwd: options.cwd, env: options.env })
      const { cwd } = options
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
    },
    start(command, args) {
      started.push([command, ...args].join(' '))
      return {
        exited: new Promise(() => {}),
        async stop() {
          stopped.push([command, ...args].join(' '))
        },
      }
    },
  }
  return { runner, calls, started, stopped }
}
