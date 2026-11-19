import { randomUUID } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import {
  type BackgroundProcess,
  type CommandRunner,
  constructedEnvironment,
} from './command_runner.ts'
import { SandboxError } from './errors.ts'
import { requireOwnWorkspace } from './own_workspace.ts'
import { SUPPORTED_KITS } from './kits.ts'

export interface AppTestOptions {
  root: string
  kit: string
  installBrowsers: boolean
  runner: CommandRunner
  /** Resolves when the owned endpoint answers, rejects after the timeout. */
  waitForUrl: typeof waitForUrl
  vitePort?: number
  /** Path of the Playwright CLI that the app's `@japa/browser-client` uses. */
  playwrightCli?: (appDirectory: string) => string
  log: (line: string) => void
}

const VITE_SCRIPT = fileURLToPath(new URL('./vite_server.mjs', import.meta.url))

function playwrightCliFor(appDirectory: string): string {
  const browserClient = createRequire(join(appDirectory, 'package.json')).resolve(
    '@japa/browser-client'
  )
  const playwright = createRequire(browserClient).resolve('playwright/package.json')
  return join(dirname(playwright), 'cli.js')
}

export async function waitForUrl(
  url: string,
  timeoutMs: number,
  options: { signal?: AbortSignal; expectedReadiness?: string } = {}
): Promise<void> {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    options.signal?.throwIfAborted()
    const remaining = Math.ceil(deadline - performance.now())
    const timeout = AbortSignal.timeout(Math.max(0, remaining))
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
    try {
      const response = await fetch(url, { signal, redirect: 'error' })
      await response.body?.cancel()
      if (
        response.ok &&
        (options.expectedReadiness === undefined ||
          response.headers.get('x-starter-runner-readiness') === options.expectedReadiness)
      ) {
        return
      }
    } catch {
      options.signal?.throwIfAborted()
    }
    const pause = Math.min(100, deadline - performance.now())
    if (pause > 0) await delay(pause, undefined, { signal: options.signal })
  }
  throw new SandboxError(`${url} did not answer within ${timeoutMs / 1000}s`)
}

/**
 * Installs, checks and tests one app in a private copy under `tmp/test-app/`.
 */
export async function testApp(options: AppTestOptions): Promise<void> {
  if (!(SUPPORTED_KITS as readonly string[]).includes(options.kit)) {
    throw new SandboxError(`Unknown kit ${options.kit}`)
  }
  const source = resolve(options.root, 'apps', options.kit)
  if (!existsSync(join(source, 'package.json'))) throw new SandboxError(`No app at ${source}`)
  const copies = join(options.root, 'tmp', 'test-app')
  mkdirSync(copies, { recursive: true })
  const app = mkdtempSync(join(copies, `${options.kit}-`))

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
    await run('pnpm', ['install', '--frozen-lockfile'])
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
      const port = options.vitePort ?? 5173
      // A response from another listener on this port cannot satisfy this run's probe.
      const readinessPath = `/@starter-runner/${randomUUID()}`
      const controller = new AbortController()
      options.log(`$ vite --host 127.0.0.1 --port ${port} --strictPort`)
      vite = options.runner.start(process.execPath, [VITE_SCRIPT, String(port), readinessPath], {
        cwd: app,
        env,
      })
      try {
        await Promise.race([
          vite.exited.then((error) => {
            throw error
          }),
          options.waitForUrl(`http://127.0.0.1:${port}${readinessPath}`, 30_000, {
            signal: controller.signal,
            expectedReadiness: readinessPath,
          }),
        ])
      } finally {
        controller.abort()
      }
    }

    await run('pnpm', ['test'])
  } finally {
    try {
      await vite?.stop()
    } finally {
      rmSync(app, { recursive: true, force: true })
    }
  }
}
