import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
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
      let closed = false
      const drained = new Promise<void>((resolve) => {
        child.once('close', () => {
          closed = true
          resolve()
        })
      })
      const exited = new Promise<Error>((resolve) => {
        child.once('error', resolve)
        child.once('exit', (code, signal) => {
          // Let ordinary stderr drain briefly without waiting on a descendant's inherited pipe.
          void Promise.race([drained, delay(100, undefined, { ref: false })]).then(() =>
            resolve(
              new SandboxError(
                `Background command exited (${signal ?? code}): ${shown}\n  in ${cwd}\n${Buffer.concat(output).toString('utf8')}`
              )
            )
          )
        })
      })
      const signalGroup = (signal: NodeJS.Signals) => {
        if (closed || child.pid === undefined) return
        try {
          process.kill(-child.pid, signal)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
        }
      }
      return {
        exited,
        async stop() {
          if (closed || child.pid === undefined) return
          try {
            signalGroup('SIGTERM')
            await Promise.race([drained, delay(1000)])
            if (closed) return
            signalGroup('SIGKILL')
            await Promise.race([drained, delay(1000)])
            if (!closed) throw new SandboxError(`Background command did not close: ${shown}`)
          } finally {
            child.stdout.destroy()
            child.stderr.destroy()
            child.unref()
          }
        },
      }
    },
  }
}
