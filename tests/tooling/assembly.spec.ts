import { test } from '@japa/runner'
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type AssemblyOptions, resolveOutDirectory, runAssembly } from '../../src/assembly.ts'
import { listFiles } from '../../src/file_tree.ts'
import { resolvePendingConflicts } from '../../src/resolutions.ts'
import { pruneUnusedResolutions } from '../../src/resolve_command.ts'
import { exactly } from '../helpers/exact_message.ts'
import { fakeRunner } from '../helpers/fake_runner.ts'
import { ACCOUNT_KIT, SOFT_DELETE, SandboxFixture } from '../helpers/sandbox_fixture.ts'

const ROUTES =
  "import router from '@adonisjs/core/services/router'\n\nrouter.get('/', () => 'ok')\n"

function options(fixture: SandboxFixture, overrides: Partial<AssemblyOptions> = {}) {
  const fake = fakeRunner()
  const logged: string[] = []
  const value: AssemblyOptions = {
    root: fixture.root,
    config: fixture.config,
    kits: ['api'],
    mode: 'assemble',
    remoteUrlFor: fixture.world.remoteUrlFor,
    runner: fake.runner,
    log: (line) => logged.push(line),
    ...overrides,
  }
  return { value, fake, logged }
}

/** Every file in the sandbox root outside `tmp/`, with its bytes. */
function snapshotOutsideTmp(root: string): string {
  return listFiles(root, { skipDirectory: (path) => path === 'tmp' })
    .map((entry) => `${entry.path}:${readFileSync(join(root, entry.path), 'utf8')}`)
    .join('\n')
}

function publishAccountKit(fixture: SandboxFixture) {
  fixture.publish({
    name: ACCOUNT_KIT,
    version: '0.3.1',
    changes: () => ({
      'package.json': `${JSON.stringify(
        {
          name: 'account-kit-api-example',
          private: true,
          scripts: { 'test': 'node ace test', 'kit:pack': 'pnpm pack' },
          dependencies: {
            '@kevinjohn/adonisjs-account-kit': 'file:vendor/kevinjohn-adonisjs-account-kit.tgz',
          },
        },
        null,
        2
      )}\n`,
      '.env.example': 'APP_KEY=\n',
      'app/account.ts': 'export {}\n',
    }),
  })
}

test.group('assembly', (group) => {
  let fixture: SandboxFixture
  group.each.setup(() => {
    fixture = new SandboxFixture()
    return () => fixture.cleanup()
  })

  test('assembles apps/<kit> and then checks it', async ({ assert }) => {
    publishAccountKit(fixture)
    const assemble = options(fixture)
    assert.isTrue(await runAssembly(assemble.value))

    const app = join(fixture.root, 'apps/api')
    const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
    assert.equal(manifest.name, 'adonisjs-starter-examples-api')
    assert.equal(
      manifest.dependencies['@kevinjohn/adonisjs-account-kit'],
      'https://github.com/Kevinjohn/oss-adonisjs-account-kit/releases/download/v0.3.1/kevinjohn-adonisjs-account-kit-0.3.1.tgz'
    )
    assert.include(readFileSync(join(app, 'README.md'), 'utf8'), fixture.baseCommit)
    assert.isTrue(existsSync(join(app, 'pnpm-lock.yaml')))
    assert.isFalse(existsSync(join(fixture.root, 'tmp/work/api')))
    for (const call of assemble.fake.calls) {
      assert.deepEqual(
        Object.keys(call.env).filter((key) => key.startsWith('ACCOUNT_KIT_')),
        []
      )
    }

    const check = options(fixture, { mode: 'check' })
    const before = snapshotOutsideTmp(fixture.root)
    assert.isTrue(await runAssembly(check.value), check.logged.join('\n'))
    assert.equal(check.fake.calls[0].args.join(' '), 'install --frozen-lockfile')
    assert.equal(snapshotOutsideTmp(fixture.root), before)
  })

  test('check fails, lists differences and writes nothing outside tmp/', async ({ assert }) => {
    publishAccountKit(fixture)
    await runAssembly(options(fixture).value)
    writeFileSync(join(fixture.root, 'apps/api/app/account.ts'), 'edited by hand\n')
    writeFileSync(join(fixture.root, 'apps/api/app/stray.ts'), 'stray\n')

    const check = options(fixture, { mode: 'check' })
    const before = snapshotOutsideTmp(fixture.root)
    assert.isFalse(await runAssembly(check.value))
    assert.includeMembers(check.logged, [
      'changed apps/api/app/account.ts',
      'removed apps/api/app/stray.ts',
    ])
    assert.equal(snapshotOutsideTmp(fixture.root), before)
  })

  test('check fails on an unused resolution until it is pruned', async ({ assert }) => {
    publishAccountKit(fixture)
    fixture.publish({
      name: SOFT_DELETE,
      version: '0.1.4',
      changes: () => ({ 'start/routes.ts': `${ROUTES}// sd\n` }),
    })
    await runAssembly(options(fixture).value)
    const stale = join(fixture.root, 'resolutions/api/lucid-soft-delete/start/old.ts')
    mkdirSync(join(stale, '..'), { recursive: true })
    writeFileSync(stale, 'old\n')
    writeFileSync(
      `${stale}.inputs.json`,
      JSON.stringify({
        path: 'start/old.ts',
        base: null,
        ours: null,
        theirs: null,
        result: 'content',
      })
    )

    const assemble = options(fixture)
    assert.isTrue(await runAssembly(assemble.value))
    assert.include(
      assemble.logged,
      'warning: unused resolution resolutions/api/lucid-soft-delete/start/old.ts (run pnpm resolve --kit api --prune-unused)'
    )
    const failing = options(fixture, { mode: 'check' })
    assert.isFalse(await runAssembly(failing.value))
    assert.include(
      failing.logged,
      'Unused resolution resolutions/api/lucid-soft-delete/start/old.ts'
    )

    pruneUnusedResolutions({ ...options(fixture).value, kit: 'api' })
    assert.isTrue(await runAssembly(options(fixture, { mode: 'check' }).value))
  })

  test('--out must be inside tmp/, after following symlinks', ({ assert }) => {
    mkdirSync(join(fixture.root, 'apps'), { recursive: true })
    symlinkSync(join(fixture.root, 'apps'), join(fixture.root, 'tmp/apps-link'))
    for (const out of [
      join(fixture.root, 'apps'),
      fixture.world.directory,
      join(fixture.root, 'tmp/apps-link/api'),
      join(fixture.root, 'tmp'),
    ]) {
      assert.throws(() => resolveOutDirectory(fixture.root, out), /^--out must be a folder inside /)
    }
    assert.equal(
      resolveOutDirectory(fixture.root, join(fixture.root, 'tmp/combined')),
      join(fixture.root, 'tmp/combined')
    )
  })

  test('--with-local packs the local package into vendor/ and writes to --out', async ({
    assert,
  }) => {
    publishAccountKit(fixture)
    const localRoot = fixture.world.workPath('Kevinjohn/oss-adonisjs-account-kit')
    writeFileSync(join(localRoot, 'examples/api/app/unreleased.ts'), 'export {}\n')
    const out = join(fixture.root, 'tmp/combined')
    const run = options(fixture, { local: { root: localRoot, out } })

    assert.isTrue(await runAssembly(run.value), run.logged.join('\n'))
    assert.deepEqual(
      run.fake.calls.slice(0, 2).map((call) => call.args.slice(0, 3).join(' ')),
      [`--dir ${localRoot} build`, `--dir ${localRoot} pack`]
    )
    assert.equal(
      readFileSync(join(out, 'api/vendor/kevinjohn-adonisjs-account-kit.tgz'), 'utf8'),
      'archive bytes'
    )
    assert.isTrue(existsSync(join(out, 'api/app/unreleased.ts')))
    const manifest = JSON.parse(readFileSync(join(out, 'api/package.json'), 'utf8'))
    assert.equal(
      manifest.dependencies['@kevinjohn/adonisjs-account-kit'],
      'file:vendor/kevinjohn-adonisjs-account-kit.tgz'
    )
    assert.isFalse(existsSync(join(fixture.root, 'apps')))
  })

  test('--with-local writes pending conflicts under <out>/conflicts/', async ({ assert }) => {
    publishAccountKit(fixture)
    fixture.publish({
      name: SOFT_DELETE,
      version: '0.1.4',
      changes: () => ({ 'start/routes.ts': `${ROUTES}// sd\n` }),
    })
    const localRoot = fixture.world.workPath('Kevinjohn/oss-adonisjs-account-kit')
    writeFileSync(join(localRoot, 'examples/api/start/routes.ts'), `${ROUTES}// local\n`)
    const out = join(fixture.root, 'tmp/combined')

    assert.isFalse(await runAssembly(options(fixture, { local: { root: localRoot, out } }).value))
    assert.isTrue(existsSync(join(out, 'conflicts/api/lucid-soft-delete/start/routes.ts')))
    assert.isFalse(existsSync(join(fixture.root, 'tmp/conflicts')))
    assert.throws(() =>
      resolvePendingConflicts({
        pendingRoot: join(fixture.root, 'tmp/conflicts'),
        resolutionsRoot: join(fixture.root, 'resolutions'),
        kit: 'api',
        deletes: ['start/routes.ts'],
      })
    )
  })

  test('refuses a local package the config does not list', async ({ assert }) => {
    publishAccountKit(fixture)
    const localRoot = fixture.world.workPath('Kevinjohn/oss-adonisjs-account-kit')
    writeFileSync(join(localRoot, 'package.json'), '{"name": "@kevinjohn/adonisjs-other"}\n')
    await assert.rejects(
      () =>
        runAssembly(
          options(fixture, { local: { root: localRoot, out: join(fixture.root, 'tmp/x') } }).value
        ),
      exactly('Add @kevinjohn/adonisjs-other to config/sandbox.json in the sandbox first')
    )
  })
})
