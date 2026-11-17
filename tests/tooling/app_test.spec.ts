import { test } from '@japa/runner'
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { testApp } from '../../src/app_test.ts'
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

      const app = join(world.sandboxRoot, 'tmp/test-app', kit)
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
      assert.deepEqual(fake.started, ['pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort'])
      assert.deepEqual(fake.stopped, fake.started)
      assert.deepEqual(waited, ['http://127.0.0.1:5173/@vite/client'])
      assert.isFalse(existsSync(app))
      assert.equal(snapshot(source), before)
    })
  }

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
    assert.isFalse(existsSync(join(world.sandboxRoot, 'tmp/test-app/inertia-react')))
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
    assert.isFalse(existsSync(join(world.sandboxRoot, 'tmp/test-app/inertia-react')))
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
    assert.isFalse(existsSync(join(world.sandboxRoot, 'tmp/test-app/inertia-react')))
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
    assert.equal(fake.calls[0].cwd, join(world.sandboxRoot, 'tmp/test-app/api'))
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
    assert.isFalse(existsSync(join(world.sandboxRoot, 'tmp/test-app/inertia-react')))
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
    assert.isFalse(existsSync(join(world.sandboxRoot, 'tmp/test-app/inertia-react')))
  })
})
