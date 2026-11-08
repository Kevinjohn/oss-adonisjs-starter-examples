import { copyFileSync, cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import {
  type BackgroundProcess,
  type CommandRunner,
  constructedEnvironment,
} from './command_runner.ts'
import { SandboxError } from './errors.ts'
import { PEER_AHEAD_FILE } from './peer_ahead.ts'
import { requireOwnWorkspace } from './regenerate.ts'
import { SUPPORTED_KITS } from './sandbox_config.ts'

export interface AppTestOptions {
  root: string
  kit: string
  /** Folder holding `<kit>/`, relative to the sandbox root: `apps` or a `--with-local` output. */
  directory: string
  installBrowsers: boolean
  runner: CommandRunner
  /** Resolves when the URL answers, rejects after the timeout. */
  waitForUrl: (url: string, timeoutMs: number) => Promise<void>
  /** Path of the Playwright CLI that the app's `@japa/browser-client` uses. */
  playwrightCli?: (appDirectory: string) => string
  log: (line: string) => void
}

const VITE_URL = 'http://127.0.0.1:5173/@vite/client'

function playwrightCliFor(appDirectory: string): string {
  const browserClient = createRequire(join(appDirectory, 'package.json')).resolve(
    '@japa/browser-client'
  )
  const playwright = createRequire(browserClient).resolve('playwright/package.json')
  return join(dirname(playwright), 'cli.js')
}

export async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((done) => setTimeout(done, 500))
  }
  throw new SandboxError(`${url} did not answer within ${timeoutMs / 1000}s`)
}

/**
 * `pnpm test:app` (Task 1.5): installs, checks and tests one app in a copy under
 * `tmp/test-app/<kit>/`, which is deleted afterwards.
 */
export async function testApp(options: AppTestOptions): Promise<void> {
  if (!(SUPPORTED_KITS as readonly string[]).includes(options.kit)) {
    throw new SandboxError(`Unknown kit ${options.kit}`)
  }
  const source = resolve(options.root, options.directory, options.kit)
  const peerAhead = join(source, PEER_AHEAD_FILE)
  if (existsSync(peerAhead) && !existsSync(join(source, 'package.json'))) {
    options.log(readFileSync(peerAhead, 'utf8').trimEnd())
    return
  }
  if (!existsSync(join(source, 'package.json'))) throw new SandboxError(`No app at ${source}`)
  const app = join(options.root, 'tmp', 'test-app', options.kit)
  rmSync(app, { recursive: true, force: true })

  const env = constructedEnvironment({
    // Lets an old locked Playwright run on a host it does not recognise; CI never sets it.
    PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE,
  })
  const run = (command: string, args: string[]) => {
    options.log(`$ ${[command, ...args].join(' ')}`)
    return options.runner.run(command, args, { cwd: app, env })
  }
  let vite: BackgroundProcess | undefined
  try {
    cpSync(source, app, {
      recursive: true,
      verbatimSymlinks: true,
      filter: (path) => !path.split('/').includes('node_modules'),
    })
    requireOwnWorkspace(app, options.kit)
    const frozen = existsSync(join(app, 'vendor')) ? '--no-frozen-lockfile' : '--frozen-lockfile'
    await run('pnpm', ['install', frozen])
    copyFileSync(join(app, '.env.example'), join(app, '.env'))
    await run('pnpm', ['exec', 'node', 'ace', 'generate:key', '--force'])
    await run('pnpm', ['exec', 'node', 'ace', 'codegen'])
    await run('pnpm', ['exec', 'node', 'ace', 'migration:run', '--force'])

    const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
    for (const script of ['format:check', 'lint', 'typecheck', 'build']) {
      if (manifest.scripts?.[script]) await run('pnpm', [script])
    }

    if (manifest.devDependencies?.['@japa/browser-client']) {
      if (options.installBrowsers) {
        const cli = (options.playwrightCli ?? playwrightCliFor)(app)
        await run('node', [cli, 'install', '--with-deps', 'chromium'])
      }
      options.log('$ pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort')
      vite = options.runner.start(
        'pnpm',
        ['exec', 'vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
        {
          cwd: app,
          env,
        }
      )
      await options.waitForUrl(VITE_URL, 30_000)
    }

    await run('pnpm', ['test'])
  } finally {
    await vite?.stop()
    rmSync(app, { recursive: true, force: true })
  }
}
