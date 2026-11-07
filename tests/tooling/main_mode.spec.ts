import { test } from '@japa/runner'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { type AssemblyOptions, runAssembly } from '../../src/assembly.ts'
import type { CommandRunner } from '../../src/command_runner.ts'
import { fakeRunner } from '../helpers/fake_runner.ts'
import { ACCOUNT_KIT, MASQUERADE, SandboxFixture } from '../helpers/sandbox_fixture.ts'

const ACCOUNT_KIT_REPO = 'Kevinjohn/oss-adonisjs-account-kit'
const MASQUERADE_REPO = 'Kevinjohn/oss-adonisjs-masquerade'

/** The fake runner, except that `pnpm pack` writes a real archive of the checkout's package.json. */
function packingRunner() {
  const fake = fakeRunner()
  const runner: CommandRunner = {
    async run(command, args, options) {
      await fake.runner.run(command, args, options)
      if (args[0] !== 'pack') return
      const archive = args[args.indexOf('--out') + 1]
      const folder = mkdtempSync(join(dirname(archive), 'pack-'))
      mkdirSync(join(folder, 'package'))
      copyFileSync(join(options.cwd, 'package.json'), join(folder, 'package/package.json'))
      execFileSync('tar', ['-czf', archive, '-C', folder, 'package'])
      rmSync(folder, { recursive: true, force: true })
    },
    start: fake.runner.start,
  }
  return { runner, calls: fake.calls }
}

/** Account Kit and Masquerade released, then both moved onto a `main` branch. */
function publishBoth(fixture: SandboxFixture) {
  const app = (dependencies: Record<string, string>) =>
    `${JSON.stringify({ name: 'api-example', private: true, dependencies }, null, 2)}\n`
  fixture.publish({
    name: ACCOUNT_KIT,
    version: '0.3.1',
    changes: () => ({
      'package.json': app({ [ACCOUNT_KIT]: 'file:vendor/kevinjohn-adonisjs-account-kit.tgz' }),
      '.env.example': 'APP_KEY=\n',
      'app/kit.ts': '1\n',
    }),
  })
  fixture.publish({
    name: MASQUERADE,
    version: '0.2.2',
    buildsOn: ACCOUNT_KIT,
    changes: () => ({
      'package.json': app({
        [ACCOUNT_KIT]: 'file:vendor/kevinjohn-adonisjs-account-kit.tgz',
        [MASQUERADE]: 'file:vendor/kevinjohn-adonisjs-masquerade.tgz',
      }),
      'app/masquerade.ts': '1\n',
    }),
  })
  for (const repository of [ACCOUNT_KIT_REPO, MASQUERADE_REPO]) {
    fixture.world.workRepository(repository).run(['checkout', '-q', '-B', 'main'])
    fixture.world.commit(repository, {}, 'main')
  }
}

function options(fixture: SandboxFixture, runner: CommandRunner) {
  const logged: string[] = []
  const value: AssemblyOptions = {
    root: fixture.root,
    config: fixture.config,
    kits: ['api'],
    mode: 'main',
    out: join(fixture.root, 'tmp/apps-main'),
    remoteUrlFor: fixture.world.remoteUrlFor,
    runner,
    log: (line) => logged.push(line),
  }
  return { value, logged }
}

test.group('main mode', (group) => {
  let fixture: SandboxFixture
  group.each.setup(() => {
    fixture = new SandboxFixture()
    return () => fixture.cleanup()
  })

  test('builds each package once from the commit main pointed to', async ({ assert }) => {
    fixture = new SandboxFixture(['api', 'hypermedia'])
    publishBoth(fixture)
    const head = fixture.world.workRepository(ACCOUNT_KIT_REPO).text(['rev-parse', 'HEAD'])
    const { runner, calls } = packingRunner()
    const run = options(fixture, runner)
    run.value.kits = ['api', 'hypermedia']

    assert.isTrue(await runAssembly(run.value), run.logged.join('\n'))
    const builds = calls.filter((call) => call.args[0] === 'build')
    assert.lengthOf(builds, 2)
    assert.match(
      run.logged.find((line) => line.startsWith(`main ${ACCOUNT_KIT} `))!,
      new RegExp(
        `^main ${ACCOUNT_KIT} ${head} kevinjohn-adonisjs-account-kit.tgz sha256 [0-9a-f]{64}$`
      )
    )
    assert.deepEqual(readdirSync(join(fixture.root, 'tmp/work')), [])
  })

  test('a change only on Account Kit main survives a dependent built on the release', async ({
    assert,
  }) => {
    publishBoth(fixture)
    fixture.world.commit(ACCOUNT_KIT_REPO, { 'examples/api/app/main_only.ts': 'main\n' })
    const { runner } = packingRunner()
    const run = options(fixture, runner)

    assert.isTrue(await runAssembly(run.value), run.logged.join('\n'))
    const app = join(fixture.root, 'tmp/apps-main/api')
    assert.equal(readFileSync(join(app, 'app/main_only.ts'), 'utf8'), 'main\n')
    assert.isTrue(existsSync(join(app, 'app/masquerade.ts')))
  })

  test('installs every package from vendor/ and keeps the archives in the output', async ({
    assert,
  }) => {
    publishBoth(fixture)
    const { runner } = packingRunner()
    const run = options(fixture, runner)

    assert.isTrue(await runAssembly(run.value), run.logged.join('\n'))
    const app = join(fixture.root, 'tmp/apps-main/api')
    assert.sameMembers(readdirSync(join(app, 'vendor')), [
      'kevinjohn-adonisjs-account-kit.tgz',
      'kevinjohn-adonisjs-masquerade.tgz',
    ])
    assert.include(readFileSync(join(app, 'README.md'), 'utf8'), 'main ')
    const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies[MASQUERADE], 'file:vendor/kevinjohn-adonisjs-masquerade.tgz')
    assert.equal(
      manifest.dependencies[ACCOUNT_KIT],
      'file:vendor/kevinjohn-adonisjs-account-kit.tgz'
    )
    assert.isFalse(existsSync(join(fixture.root, 'apps')))
  })

  test('skips the sandbox peer check and reports a runtime peer mismatch apart', async ({
    assert,
  }) => {
    publishBoth(fixture)
    // Account Kit main moved to 0.4.0; Masquerade main still peers on 0.3.1 exactly.
    fixture.world.commit(ACCOUNT_KIT_REPO, {
      'package.json': `${JSON.stringify({ name: ACCOUNT_KIT, version: '0.4.0' })}\n`,
    })
    const { runner } = packingRunner()
    const run = options(fixture, runner)

    assert.isFalse(await runAssembly(run.value))
    assert.include(
      run.logged,
      `runtime peer mismatch: ${MASQUERADE}@0.2.2 peers on ${ACCOUNT_KIT} 0.3.1; main packs ${ACCOUNT_KIT}@0.4.0`
    )
    assert.isTrue(existsSync(join(fixture.root, 'tmp/apps-main/api/app/masquerade.ts')))
  })

  test('accepts a main peer range the sandbox release check would refuse', async ({ assert }) => {
    publishBoth(fixture)
    fixture.world.commit(MASQUERADE_REPO, {
      'package.json': `${JSON.stringify({
        name: MASQUERADE,
        version: '0.3.0',
        peerDependencies: { [ACCOUNT_KIT]: '^0.3.1' },
      })}\n`,
    })
    const { runner } = packingRunner()
    const run = options(fixture, runner)

    assert.isTrue(await runAssembly(run.value), run.logged.join('\n'))
  })

  test('writes conflicts under <out>/conflicts/', async ({ assert }) => {
    publishBoth(fixture)
    fixture.world.commit(ACCOUNT_KIT_REPO, { 'examples/api/app/masquerade.ts': 'kit\n' })
    const { runner } = packingRunner()
    const run = options(fixture, runner)

    assert.isFalse(await runAssembly(run.value))
    assert.isTrue(
      existsSync(join(fixture.root, 'tmp/apps-main/conflicts/api/masquerade/app/masquerade.ts'))
    )
    assert.isFalse(existsSync(join(fixture.root, 'tmp/conflicts')))
  })
})
