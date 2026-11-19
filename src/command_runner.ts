import { spawn } from 'node:child_process'
import { SandboxError } from './errors.ts'

export interface CommandOptions {
  cwd: string
  env: NodeJS.ProcessEnv
}

export interface BackgroundProcess {
  /** Resolves with the startup failure or the reason the command exited. */
  exited: Promise<Error>
  stop(): Promise<void>
}

/**
 * Runs app checks and tests. Tests replace it with a fake.
 */
export interface CommandRunner {
  /** Runs to completion; rejects with the command and its full output when it fails. */
  run(command: string, args: string[], options: CommandOptions): Promise<void>
  /** Starts a long-running command, such as Vite, in its own process group. */
  start(command: string, args: string[], options: CommandOptions): BackgroundProcess
}

/**
 * Passed through when set. pnpm derives its store and cache folders from them, so without them a
 * command in a folder installed under a CI runner's `PNPM_HOME` wants to remove `node_modules`;
 * `CI` keeps pnpm from prompting.
 */
const PASSED_THROUGH = [
  'CI',
  'PNPM_HOME',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
]

/** Keep package-manager paths and runtime settings without inheriting unrelated shell variables. */
export function constructedEnvironment(
  extra: Record<string, string | undefined> = {}
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    HOST: '127.0.0.1',
    LIMITER_STORE: 'memory',
  }
  for (const key of PASSED_THROUGH) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) env[key] = value
  }
  return env
}

/**
 * The real runner. With `stream`, output goes to this process's output as it arrives; otherwise it
 * is collected and shown only when the command fails.
 */
export function processRunner(options: { stream: boolean }): CommandRunner {
  return {
    run(command, args, { cwd, env }) {
      const shown = [command, ...args].join(' ')
      return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, env, stdio: options.stream ? 'inherit' : 'pipe' })
        const output: Buffer[] = []
        child.stdout?.on('data', (chunk: Buffer) => output.push(chunk))
        child.stderr?.on('data', (chunk: Buffer) => output.push(chunk))
        child.on('error', reject)
        child.on('close', (code) => {
          if (code === 0) return resolve()
          reject(
            new SandboxError(
              `Command failed with exit ${code}: ${shown}\n  in ${cwd}\n${Buffer.concat(output).toString('utf8')}`
            )
          )
        })
      })
    },
    start(command, args, { cwd, env }) {
      const shown = [command, ...args].join(' ')
      const child = spawn(command, args, {
        cwd,
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const output: Buffer[] = []
      child.stdout.on('data', (chunk: Buffer) => {
        if (options.stream) process.stdout.write(chunk)
        output.push(chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        if (options.stream) process.stderr.write(chunk)
        output.push(chunk)
      })
      const exited = new Promise<Error>((resolve) => {
        child.once('error', resolve)
        child.once('close', (code, signal) =>
          resolve(
            new SandboxError(
              `Background command exited (${signal ?? code}): ${shown}\n  in ${cwd}\n${Buffer.concat(output).toString('utf8')}`
            )
          )
        )
      })
      return {
        exited,
        async stop() {
          if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined)
            return
          try {
            process.kill(-child.pid, 'SIGTERM')
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
            throw error
          }
          await exited
        },
      }
    },
  }
}
