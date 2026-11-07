import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SandboxError } from './errors.ts'

/** The sandbox repository root: the folder above `src/`. */
export const SANDBOX_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Runs a command-line script. Expected failures print their message alone; the exit code is 1
 * when `main` returns false or throws.
 */
export function runCli(main: () => Promise<boolean>): void {
  main().then(
    (ok) => {
      process.exitCode = ok ? 0 : 1
    },
    (error: unknown) => {
      console.error(error instanceof SandboxError ? error.message : error)
      process.exitCode = 1
    }
  )
}
