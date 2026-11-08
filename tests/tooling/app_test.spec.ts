import { test } from '@japa/runner'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { testApp } from '../../src/app_test.ts'
import { listFiles } from '../../src/file_tree.ts'
import { exactly } from '../helpers/exact_message.ts'
import { fakeRunner } from '../helpers/fake_runner.ts'
import { FixtureWorld, kitFiles, writeFiles } from '../helpers/fixture_repos.ts'

function writeApp(
  root: string,
  devDependencies: Record<string, string> = {},
  extra = {},
  kit = 'inertia-react'
) {
  writeFiles(join(root, 'apps', kit), {
    ...kitFiles(kit),
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
  return listFiles(folder)
    .map((entry) => `${entry.path}:${readFileSync(join(folder, entry.path), 'utf8')}`)
    .join('\n')
}

test.group('test:app', (group) => {
  let world: FixtureWorld
  group.each.setup(() => {
    world = new FixtureWorld()
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
        directory: 'apps',
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

  test('installs without a frozen lockfile when the app has vendor/', async ({ assert }) => {
    writeApp(world.sandboxRoot, {}, { 'vendor/kevinjohn-adonisjs-account-kit.tgz': 'archive' })
    const fake = fakeRunner()
    await testApp({
      root: world.sandboxRoot,
      kit: 'inertia-react',
      directory: 'apps',
      installBrowsers: false,
      runner: fake.runner,
      waitForUrl: async () => {},
      log: () => {},
    })
    assert.equal(fake.calls[0].args.join(' '), 'install --no-frozen-lockfile')
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
          directory: 'apps',
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

  test('skips with the note when assembly left a peer-ahead note instead of an app', async ({
    assert,
  }) => {
    writeFiles(join(world.sandboxRoot, 'tmp/combined/api'), { '.peer-ahead': 'the note\n' })
    const fake = fakeRunner()
    const logged: string[] = []
    await testApp({
      root: world.sandboxRoot,
      kit: 'api',
      directory: 'tmp/combined',
      installBrowsers: false,
      runner: fake.runner,
      waitForUrl: async () => {},
      log: (line) => logged.push(line),
    })
    assert.deepEqual(logged, ['the note'])
    assert.deepEqual(fake.calls, [])
    assert.isFalse(existsSync(join(world.sandboxRoot, 'tmp/test-app/api')))
  })

  test('refuses an unknown kit before touching any folder', async ({ assert }) => {
    writeApp(world.sandboxRoot)
    await assert.rejects(
      () =>
        testApp({
          root: world.sandboxRoot,
          kit: '../../apps/inertia-react',
          directory: 'tmp/test-app',
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
          directory: 'apps',
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
          directory: 'apps',
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
})
