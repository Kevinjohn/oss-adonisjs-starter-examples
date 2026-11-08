import { test } from '@japa/runner'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  type AssemblyOptions,
  createWorkDirectory,
  resolveOutDirectory,
  runAssembly,
} from '../../src/assembly.ts'
import { listFiles } from '../../src/file_tree.ts'
import { resolvePendingConflicts } from '../../src/resolutions.ts'
import { Git } from '../../src/git.ts'
import { SANDBOX_ROOT } from '../../src/cli.ts'
import { pruneUnusedResolutions, refusePruneWithLocalPending } from '../../src/resolve_command.ts'
import { exactly } from '../helpers/exact_message.ts'
import { fakeRunner } from '../helpers/fake_runner.ts'
import { ACCOUNT_KIT, MASQUERADE, SOFT_DELETE, SandboxFixture } from '../helpers/sandbox_fixture.ts'

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
    assert.deepEqual(readdirSync(join(fixture.root, 'tmp/work')), [])
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

  test('assembles and checks Vue with packages that do not provide it, including --with-local', async ({
    assert,
  }) => {
    fixture.cleanup()
    fixture = new SandboxFixture(['api', 'inertia-vue'])
    publishAccountKit(fixture)
    fixture.publish({
      name: SOFT_DELETE,
      version: '0.1.4',
      kits: ['api'],
      changes: () => ({ 'app/soft_delete.ts': 'export {}\n' }),
    })
    const run = options(fixture, { kits: ['inertia-vue'] })
    assert.isTrue(await runAssembly(run.value), run.logged.join('\n'))
    const app = join(fixture.root, 'apps/inertia-vue')
    const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
    assert.equal(manifest.name, 'adonisjs-starter-examples-inertia-vue')
    assert.deepEqual(Object.keys(manifest.dependencies), [ACCOUNT_KIT])
    const readme = readFileSync(join(app, 'README.md'), 'utf8')
    assert.include(readme, '/examples/inertia-vue)')
    assert.notInclude(readme, SOFT_DELETE)
    assert.isFalse(existsSync(join(app, 'app/soft_delete.ts')))

    const check = options(fixture, { kits: ['inertia-vue'], mode: 'check' })
    assert.isTrue(await runAssembly(check.value), check.logged.join('\n'))
    const before = snapshotOutsideTmp(fixture.root)
    const localRoot = fixture.world.workPath('Kevinjohn/oss-adonisjs-account-kit')
    writeFileSync(join(localRoot, 'examples/inertia-vue/app/local.ts'), 'export {}\n')
    const out = join(fixture.root, 'tmp/vue-local')
    const local = options(fixture, { kits: ['inertia-vue'], local: { root: localRoot, out } })
    assert.isTrue(await runAssembly(local.value), local.logged.join('\n'))
    assert.isTrue(existsSync(join(out, 'inertia-vue/app/local.ts')))
    assert.deepEqual(readdirSync(join(out, 'inertia-vue/vendor')), [
      'kevinjohn-adonisjs-account-kit.tgz',
    ])
    const localManifest = JSON.parse(readFileSync(join(out, 'inertia-vue/package.json'), 'utf8'))
    assert.deepEqual(localManifest.dependencies, {
      [ACCOUNT_KIT]: 'file:vendor/kevinjohn-adonisjs-account-kit.tgz',
    })

    const skippedOut = join(fixture.root, 'tmp/vue-skipped-local')
    const skipped = options(fixture, {
      kits: ['inertia-vue'],
      local: {
        root: fixture.world.workPath('Kevinjohn/oss-adonisjs-lucid-soft-delete'),
        out: skippedOut,
      },
    })
    assert.isTrue(await runAssembly(skipped.value), skipped.logged.join('\n'))
    assert.isFalse(existsSync(join(skippedOut, 'inertia-vue/vendor')))
    assert.equal(
      readFileSync(join(skippedOut, 'inertia-vue/package.json'), 'utf8'),
      readFileSync(join(app, 'package.json'), 'utf8')
    )
    assert.equal(snapshotOutsideTmp(fixture.root), before)
  })

  test('each run gets its own scratch folder and leaves the others alone', ({ assert }) => {
    const first = createWorkDirectory(fixture.root, 'api')
    writeFileSync(join(first, 'in-use'), '')
    const second = createWorkDirectory(fixture.root, 'api')
    assert.notEqual(first, second)
    assert.isTrue(existsSync(join(first, 'in-use')))
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

  test('--prune-unused refuses the conflicts of a --with-local run', ({ assert }) => {
    const local = resolveOutDirectory(fixture.root, join(fixture.root, 'tmp/combined/conflicts'))
    assert.throws(
      () => refusePruneWithLocalPending(fixture.root, local),
      exactly(
        '--prune-unused merges the released packages, so it would delete the resolutions saved from --pending. Run it without --pending.'
      )
    )
    const released = resolveOutDirectory(fixture.root, join(fixture.root, 'tmp/conflicts'))
    assert.doesNotThrow(() => refusePruneWithLocalPending(fixture.root, released))
  })

  test('git stores committed apps and resolutions byte for byte', ({ assert }) => {
    const attributes = new Git(SANDBOX_ROOT).text([
      'check-attr',
      'text',
      '--',
      'apps/api/start/routes.ts',
      'resolutions/api/lucid-soft-delete/start/routes.ts',
    ])
    assert.equal(
      attributes,
      'apps/api/start/routes.ts: text: unset\nresolutions/api/lucid-soft-delete/start/routes.ts: text: unset'
    )
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
    assert.throws(
      () => resolveOutDirectory(fixture.root, join(fixture.root, 'apps'), '--pending'),
      /^--pending must be a folder inside /
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
    assert.deepEqual(readdirSync(join(fixture.root, 'tmp/work')), [])
  })

  test('--with-local writes pending conflicts under <out>/conflicts/ and they can be saved', async ({
    assert,
  }) => {
    publishAccountKit(fixture)
    fixture.publish({
      name: SOFT_DELETE,
      version: '0.1.4',
      changes: () => ({ 'start/routes.ts': `${ROUTES}// sd\n` }),
    })
    const localRoot = fixture.world.workPath('Kevinjohn/oss-adonisjs-account-kit')
    writeFileSync(join(localRoot, 'examples/api/start/routes.ts'), `${ROUTES}// local\n`)
    const out = join(fixture.root, 'tmp/combined')

    const first = options(fixture, { local: { root: localRoot, out } })
    assert.isFalse(await runAssembly(first.value))
    const pending = join(out, 'conflicts/api/lucid-soft-delete/start/routes.ts')
    assert.isTrue(existsSync(pending))
    assert.isFalse(existsSync(join(fixture.root, 'tmp/conflicts')))
    assert.include(
      first.logged.join('\n'),
      '  pnpm resolve --kit api --pending tmp/combined/conflicts\n'
    )

    writeFileSync(pending, `${ROUTES}// local\n// sd\n`)
    resolvePendingConflicts({
      pendingRoot: join(out, 'conflicts'),
      resolutionsRoot: join(fixture.root, 'resolutions'),
      kit: 'api',
      deletes: [],
    })
    const second = options(fixture, { local: { root: localRoot, out } })
    assert.isTrue(await runAssembly(second.value), second.logged.join('\n'))
    assert.equal(
      readFileSync(join(out, 'api/start/routes.ts'), 'utf8'),
      `${ROUTES}// local\n// sd\n`
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

  test('--with-local skips a package that peers on a newer release than the sandbox', async ({
    assert,
  }) => {
    publishAccountKit(fixture)
    fixture.publish({
      name: MASQUERADE,
      version: '0.2.6',
      buildsOn: ACCOUNT_KIT,
      changes: () => ({}),
    })
    const localRoot = fixture.world.workPath('Kevinjohn/oss-adonisjs-masquerade')
    const writePeer = (peer: string) =>
      writeFileSync(
        join(localRoot, 'package.json'),
        `${JSON.stringify({ name: MASQUERADE, version: '0.2.6', peerDependencies: { [ACCOUNT_KIT]: peer } })}\n`
      )
    const out = join(fixture.root, 'tmp/combined')
    mkdirSync(join(out, 'api'), { recursive: true })
    writeFileSync(join(out, 'api/package.json'), '{}\n')

    writePeer('0.3.2')
    const ahead = options(fixture, { local: { root: localRoot, out } })
    assert.isTrue(await runAssembly(ahead.value), ahead.logged.join('\n'))
    const note = `${MASQUERADE} peers on ${ACCOUNT_KIT} 0.3.2; the sandbox uses ${ACCOUNT_KIT}@0.3.1. Skipped: the sandbox pull request that moves ${ACCOUNT_KIT} to 0.3.2 combines this change (16.5).`
    assert.include(ahead.logged, `api: ${note}`)
    assert.deepEqual(ahead.fake.calls, [])
    assert.deepEqual(readdirSync(join(out, 'api')), ['.peer-ahead'])
    assert.equal(readFileSync(join(out, 'api/.peer-ahead'), 'utf8'), `${note}\n`)

    for (const peer of ['0.3.0', '^0.3.2', '0.3.2-next.1']) {
      writePeer(peer)
      const other = options(fixture, { local: { root: localRoot, out } })
      assert.isFalse(await runAssembly(other.value), peer)
      assert.include(
        other.logged,
        `api: ${MASQUERADE}@0.2.6 peers on ${ACCOUNT_KIT} ${peer}; the sandbox uses ${ACCOUNT_KIT}@0.3.1`
      )
    }
  })

  test('--out works before tmp/ exists', ({ assert }) => {
    rmSync(join(fixture.root, 'tmp'), { recursive: true, force: true })
    assert.equal(
      resolveOutDirectory(fixture.root, join(fixture.root, 'tmp/preview')),
      join(realpathSync(fixture.root), 'tmp/preview')
    )
  })

  test('a failed local build leaves no scratch folder', async ({ assert }) => {
    publishAccountKit(fixture)
    const localRoot = fixture.world.workPath('Kevinjohn/oss-adonisjs-account-kit')
    const fake = fakeRunner({
      build: () => {
        throw new Error('build failed')
      },
    })
    const run = options(fixture, {
      local: { root: localRoot, out: join(fixture.root, 'tmp/combined') },
      runner: fake.runner,
    })
    await assert.rejects(() => runAssembly(run.value), exactly('build failed'))
    assert.deepEqual(readdirSync(join(fixture.root, 'tmp/work')), [])
  })
})
