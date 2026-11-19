import { test } from '@japa/runner'
import { once } from 'node:events'
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { type RequestListener, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { join } from 'node:path'
import { testApp, waitForUrl } from '../../src/app_test.ts'
import { processRunner } from '../../src/command_runner.ts'
import { exactly } from '../helpers/exact_message.ts'
import { fakeRunner } from '../helpers/fake_runner.ts'
import { AppTestWorld, appFiles, writeFiles } from '../helpers/app_fixture.ts'

function writeApp(
  root: string,
  devDependencies: Record<string, string> = {},
  extra = {},
  kit = 'inertia-react'
) {
  writeFiles(join(root, 'apps', kit), {
    ...appFiles(kit),
    'package.json': `${JSON.stringify(
      {
        name: 'app',
        scripts: { test: 'node ace test', lint: 'eslint .', build: 'node ace build' },
        devDependencies,
      },
      null,
      2
    )}\n`,
    '.env.example': 'APP_KEY=\n',
    'node_modules/stale/index.js': 'not copied\n',
    ...extra,
  })
}

function snapshot(folder: string): string {
  const files = (directory: string, prefix = ''): string[] =>
    readdirSync(join(directory, prefix), { withFileTypes: true }).flatMap((entry) => {
      const path = join(prefix, entry.name)
      return entry.isDirectory() ? files(directory, path) : [path]
    })
  return files(folder)
    .sort()
    .map((path) => `${path}:${readFileSync(join(folder, path), 'utf8')}`)
    .join('\n')
}

async function localServer(listener: RequestListener) {
  const server = createServer(listener)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {
    port: (server.address() as AddressInfo).port,
    close() {
      server.close()
      server.closeAllConnections()
    },
  }
}

test.group('Vite readiness', () => {
  test('times out even when an accepted request never receives headers', async ({ assert }) => {
    let handled = false
    const server = await localServer(() => {
      handled = true
    })
    const url = `http://127.0.0.1:${server.port}/@vite/client`
    const watchdog = new AbortController()
    try {
      await assert.rejects(
        () =>
          Promise.race([
            waitForUrl(url, 150),
            delay(1_500, undefined, { signal: watchdog.signal }).then(() => {
              throw new Error('Test watchdog fired before the readiness deadline')
            }),
          ]),
        exactly(`${url} did not answer within 0.15s`)
      )
      assert.isTrue(handled)
    } finally {
      watchdog.abort()
      server.close()
    }
  })
})

test.group('test:app', (group) => {
  let world: AppTestWorld
  group.each.setup(() => {
    world = new AppTestWorld()
    return () => world.cleanup()
  })

  for (const kit of ['inertia-react', 'inertia-vue']) {
    test(`runs the ${kit} browser sequence in a copy and deletes it`, async ({ assert }) => {
      writeApp(world.sandboxRoot, { '@japa/browser-client': '^2.0.0' }, {}, kit)
      const source = join(world.sandboxRoot, 'apps', kit)
      const before = snapshot(source)
      const fake = fakeRunner()
      const waited: string[] = []

      await testApp({
        root: world.sandboxRoot,
        kit,
        installBrowsers: true,
        runner: fake.runner,
        waitForUrl: async (url) => {
          waited.push(url)
        },
        playwrightCli: (app) => join(app, 'playwright/cli.js'),
        log: () => {},
      })

      const app = fake.calls[0].cwd
      assert.deepEqual(
        fake.calls.map((call) => [call.command, ...call.args].join(' ')),
        [
          'pnpm install --frozen-lockfile',
          'pnpm exec node ace generate:key --force',
          'pnpm exec node ace codegen',
          'pnpm exec node ace migration:run --force',
          'pnpm lint',
          'pnpm build',
          `node ${join(app, 'playwright/cli.js')} install --with-deps chromium`,
          'pnpm test',
        ]
      )
      assert.isTrue(fake.calls.every((call) => call.cwd === app))
      assert.lengthOf(fake.started, 1)
      assert.include(fake.started[0], '/vite_server.mjs 5173 /@starter-runner/')
      assert.deepEqual(fake.stopped, fake.started)
      assert.lengthOf(waited, 1)
      assert.include(waited[0], 'http://127.0.0.1:5173/@starter-runner/')
      assert.isTrue(fake.started[0].endsWith(new URL(waited[0]).pathname))
      assert.isFalse(existsSync(app))
      assert.equal(snapshot(source), before)
    })
  }

  test('keeps overlapping copies private and removes only owned files', async ({ assert }) => {
    writeApp(world.sandboxRoot)
    const copies = join(world.sandboxRoot, 'tmp/test-app')
    const options = {
      root: world.sandboxRoot,
      kit: 'inertia-react',
      installBrowsers: false,
      waitForUrl: async () => {},
      log: () => {},
    }
    const firstRunner = fakeRunner().runner
    const second = fakeRunner()
    const firstCopy = Promise.withResolvers<string>()
    const resume = Promise.withResolvers<void>()
    const first = testApp({
      ...options,
      runner: {
        ...firstRunner,
        async run(command, args, commandOptions) {
          if (args[0] === 'install') {
            firstCopy.resolve(commandOptions.cwd)
            await resume.promise
            assert.isTrue(existsSync(join(commandOptions.cwd, '.env.example')))
          }
          await firstRunner.run(command, args, commandOptions)
        },
      },
    })
    try {
      const ownedByFirst = await Promise.race([
        firstCopy.promise,
        first.then(() => {
          throw new Error('The first runner finished before reaching install')
        }),
      ])
      await testApp({ ...options, runner: second.runner })
      const ownedBySecond = second.calls[0].cwd
      assert.notEqual(ownedBySecond, ownedByFirst)
      assert.isTrue(existsSync(join(ownedByFirst, 'package.json')))
      assert.isFalse(existsSync(ownedBySecond))
    } finally {
      resume.resolve()
      await first
    }
    assert.deepEqual(readdirSync(copies), [])
  })

  test('reports an occupied Vite port before starting browser tests', async ({ assert }) => {
    writeApp(world.sandboxRoot, { '@japa/browser-client': '^2.0.0' })
    const fake = fakeRunner()
    // Exercise the real child launcher without installing the starter's dependencies in this test.
    const viteFixture = `
      import { createServer as createHttpServer } from 'node:http'
      export async function createServer({ server: options, plugins }) {
        const server = createHttpServer()
        for (const plugin of plugins) {
          plugin.configureServer({ middlewares: { use: (handler) => server.on('request', handler) } })
        }
        return {
          listen() {
            return new Promise((resolve, reject) => {
              server.once('error', reject)
              server.listen(options.port, options.host, resolve)
            })
          },
          close() { server.close() },
        }
      }
    `
    const stale = await localServer((_request, response) => response.end('stale server'))
    try {
      await assert.rejects(
        () =>
          testApp({
            root: world.sandboxRoot,
            kit: 'inertia-react',
            installBrowsers: false,
            vitePort: stale.port,
            waitForUrl,
            runner: {
              ...processRunner({ stream: false }),
              async run(command, args, options) {
                await fake.runner.run(command, args, options)
                if (args[0] === 'install') {
                  writeFiles(join(options.cwd, 'node_modules/vite'), {
                    'package.json': JSON.stringify({ type: 'module', main: 'index.js' }),
                    'index.js': viteFixture,
                  })
                }
              },
            },
            log: () => {},
          }),
        new RegExp(`EADDRINUSE: address already in use 127.0.0.1:${stale.port}`)
      )
      assert.isFalse(fake.calls.some((call) => call.args[0] === 'test'))
      assert.deepEqual(readdirSync(join(world.sandboxRoot, 'tmp/test-app')), [])
    } finally {
      stale.close()
    }
  })

  test('uses the checked-in lockfile when the app has vendor/', async ({ assert }) => {
    writeApp(world.sandboxRoot, {}, { 'vendor/kevinjohn-adonisjs-account-kit.tgz': 'archive' })
    const fake = fakeRunner()
    await testApp({
      root: world.sandboxRoot,
      kit: 'inertia-react',
      installBrowsers: false,
      runner: fake.runner,
      waitForUrl: async () => {},
      log: () => {},
    })
    assert.equal(fake.calls[0].args.join(' '), 'install --frozen-lockfile')
    assert.deepEqual(fake.started, [])
  })

  test('stops Vite and deletes the copy after a failing step', async ({ assert }) => {
    writeApp(world.sandboxRoot, { '@japa/browser-client': '^2.0.0' })
    const fake = fakeRunner()
    const failing = {
      ...fake.runner,
      async run(command: string, args: string[], options: any) {
        await fake.runner.run(command, args, options)
        if (args[0] === 'test') throw new Error('tests failed')
      },
    }
    await assert.rejects(
      () =>
        testApp({
          root: world.sandboxRoot,
          kit: 'inertia-react',
          installBrowsers: false,
          runner: failing,
          waitForUrl: async () => {},
          log: () => {},
        }),
      exactly('tests failed')
    )
    assert.deepEqual(fake.stopped, fake.started)
    assert.lengthOf(fake.started, 1)
    assert.deepEqual(readdirSync(join(world.sandboxRoot, 'tmp/test-app')), [])
  })

  test('retains a browser test failure when stopping Vite also fails', async ({ assert }) => {
    writeApp(world.sandboxRoot, { '@japa/browser-client': '^2.0.0' })
    const fake = fakeRunner()
    const testFailure = new Error('browser tests failed')
    const cleanupFailure = new Error('Vite could not stop')
    const failure = await testApp({
      root: world.sandboxRoot,
      kit: 'inertia-react',
      installBrowsers: false,
      runner: {
        ...fake.runner,
        async run(command, args, options) {
          if (args[0] === 'test') throw testFailure
          await fake.runner.run(command, args, options)
        },
        start() {
          return {
            exited: new Promise(() => {}),
            async stop() {
              throw cleanupFailure
            },
          }
        },
      },
      waitForUrl: async () => {},
      log: () => {},
    }).catch((error: unknown) => error)
    if (!(failure instanceof AggregateError))
      throw new Error('Expected both failures', { cause: failure })
    assert.deepEqual(failure.errors, [testFailure, cleanupFailure])
    assert.deepEqual(readdirSync(join(world.sandboxRoot, 'tmp/test-app')), [])
  })

  test('refuses an unknown kit before touching any folder', async ({ assert }) => {
    writeApp(world.sandboxRoot)
    await assert.rejects(
      () =>
        testApp({
          root: world.sandboxRoot,
          kit: '../../apps/inertia-react',
          installBrowsers: false,
          runner: fakeRunner().runner,
          waitForUrl: async () => {},
          log: () => {},
        }),
      exactly('Unknown kit ../../apps/inertia-react')
    )
    assert.isTrue(existsSync(join(world.sandboxRoot, 'apps/inertia-react/package.json')))
  })

  test('deletes a partial copy when copying fails', async ({ assert }) => {
    writeApp(world.sandboxRoot)
    const unreadable = join(world.sandboxRoot, 'apps/inertia-react/zz-unreadable.ts')
    writeFileSync(unreadable, 'x\n')
    chmodSync(unreadable, 0o000)
    try {
      await assert.rejects(() =>
        testApp({
          root: world.sandboxRoot,
          kit: 'inertia-react',
          installBrowsers: false,
          runner: fakeRunner().runner,
          waitForUrl: async () => {},
          log: () => {},
        })
      )
    } finally {
      chmodSync(unreadable, 0o644)
    }
    assert.deepEqual(readdirSync(join(world.sandboxRoot, 'tmp/test-app')), [])
  })

  test('refuses an app without pnpm-workspace.yaml before installing', async ({ assert }) => {
    writeApp(world.sandboxRoot, {}, { 'pnpm-workspace.yaml': null })
    const fake = fakeRunner()
    await assert.rejects(
      () =>
        testApp({
          root: world.sandboxRoot,
          kit: 'inertia-react',
          installBrowsers: false,
          runner: fake.runner,
          waitForUrl: async () => {},
          log: () => {},
        }),
      /^inertia-react has no pnpm-workspace.yaml/
    )
    assert.deepEqual(fake.calls, [])
    assert.deepEqual(readdirSync(join(world.sandboxRoot, 'tmp/test-app')), [])
  })

  test('runs only the checked-in app and does not mutate its source', async ({ assert }) => {
    writeApp(world.sandboxRoot, {}, { 'app.ts': 'export const app = true\n' }, 'api')
    const source = join(world.sandboxRoot, 'apps/api')
    const before = snapshot(source)
    const fake = fakeRunner()
    await testApp({
      root: world.sandboxRoot,
      kit: 'api',
      installBrowsers: false,
      runner: fake.runner,
      waitForUrl: async () => {},
      log: () => {},
    })
    assert.include(fake.calls[0].cwd, join(world.sandboxRoot, 'tmp/test-app/api-'))
    assert.isTrue(fake.calls[0].args.includes('--frozen-lockfile'))
    assert.equal(snapshot(source), before)
  })

  test('removes the app copy when an install command fails', async ({ assert }) => {
    writeApp(world.sandboxRoot)
    const fake = fakeRunner()
    const failing = {
      ...fake.runner,
      async run() {
        throw new Error('install failed')
      },
    }
    await assert.rejects(
      () =>
        testApp({
          root: world.sandboxRoot,
          kit: 'inertia-react',
          installBrowsers: false,
          runner: failing,
          waitForUrl: async () => {},
          log: () => {},
        }),
      exactly('install failed')
    )
    assert.deepEqual(readdirSync(join(world.sandboxRoot, 'tmp/test-app')), [])
    assert.deepEqual(fake.started, [])
  })

  test('removes the app copy when Playwright browser installation fails', async ({ assert }) => {
    writeApp(world.sandboxRoot, { '@japa/browser-client': '^2.0.0' })
    const fake = fakeRunner()
    const failing = {
      ...fake.runner,
      async run(command: string, args: string[], options: any) {
        if (command === 'node') throw new Error('browser install failed')
        await fake.runner.run(command, args, options)
      },
    }
    await assert.rejects(
      () =>
        testApp({
          root: world.sandboxRoot,
          kit: 'inertia-react',
          installBrowsers: true,
          runner: failing,
          waitForUrl: async () => {},
          playwrightCli: () => '/playwright/cli.js',
          log: () => {},
        }),
      exactly('browser install failed')
    )
    assert.deepEqual(fake.started, [])
    assert.deepEqual(readdirSync(join(world.sandboxRoot, 'tmp/test-app')), [])
  })
})
