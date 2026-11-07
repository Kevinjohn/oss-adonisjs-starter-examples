import { test } from '@japa/runner'
import { readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { constructedEnvironment } from '../../src/command_runner.ts'
import { compareOutput } from '../../src/compare.ts'
import { initRepository } from '../../src/git.ts'
import { regenerateApp } from '../../src/regenerate.ts'
import { commitFolder } from '../../src/tree_commit.ts'
import { exactly } from '../helpers/exact_message.ts'
import { fakeRunner } from '../helpers/fake_runner.ts'
import { kitFiles, temporaryDirectory, writeFiles } from '../helpers/fixture_repos.ts'

/**
 * A sandbox-like repository whose own `.gitignore` ignores `database/` (which must not leak into
 * `<T>`), holding a scratch repository with one committed app. The app tracks a generated
 * `.adonisjs/` file that its own `.gitignore` ignores.
 */
function setup() {
  const sandbox = temporaryDirectory()
  initRepository(sandbox)
  writeFileSync(join(sandbox, '.gitignore'), 'database/\n')
  const files = join(sandbox, 'files')
  writeFiles(files, {
    ...kitFiles('api'),
    'README.md': '# assembled\n',
    'pnpm-lock.yaml': null,
    '.env.example': 'APP_KEY=\n',
    '.gitignore': 'node_modules\n.env\ntmp/*\n!tmp/.gitkeep\n.adonisjs\n',
    '.adonisjs/server/routes.d.ts': 'committed\n',
  })
  const git = initRepository(join(sandbox, 'scratch'))
  const commit = commitFolder(git, files, { parent: null, message: 'app', branch: 'app' })
  return { sandbox, git, commit, t: join(sandbox, 'tmp/work/app') }
}

test.group('regenerate', (group) => {
  let context: ReturnType<typeof setup>
  group.each.setup(() => {
    context = setup()
    return () => rmSync(context.sandbox, { recursive: true, force: true })
  })

  test('installs, restores .env.example and returns the output set', async ({ assert }) => {
    const { runner, calls } = fakeRunner()
    const logged: string[] = []
    const result = await regenerateApp({
      git: context.git,
      commit: context.commit,
      kit: 'api',
      directory: context.t,
      seedLockfile: Buffer.from("lockfileVersion: '9.0'\n# seed\n"),
      frozenLockfile: false,
      includeVendor: false,
      runner,
      env: constructedEnvironment(),
      log: (line) => logged.push(line),
    })

    assert.deepEqual(
      calls.map((call) => call.args.join(' ')),
      [
        'install --no-frozen-lockfile',
        'exec node ace generate:key --force',
        'exec node ace codegen',
        'exec node ace migration:run --force',
      ]
    )
    assert.deepEqual(logged, ['restored .env.example (api)'])
    const paths = result.files.map((file) => file.path)
    assert.includeMembers(paths, [
      '.env.example',
      'pnpm-lock.yaml',
      'database/schema.ts',
      'tmp/.gitkeep',
    ])
    for (const runtime of [
      '.env',
      'tmp/db.sqlite3',
      'node_modules/.modules.yaml',
      '.adonisjs/server/routes.d.ts',
    ]) {
      assert.notInclude(paths, runtime)
    }
    const file = (path: string) => result.files.find((entry) => entry.path === path)!
    assert.equal(file('.env.example').bytes.toString(), 'APP_KEY=\n')
    assert.equal(file('database/schema.ts').bytes.toString(), 'export class RegeneratedSchema {}\n')
    assert.equal(file('pnpm-lock.yaml').bytes.toString(), "lockfileVersion: '9.0'\n# regenerated\n")
    assert.isTrue(file('bin/server.ts').executable)
  })

  test('installs with a frozen lockfile in check mode', async ({ assert }) => {
    const { runner, calls } = fakeRunner()
    const result = await regenerateApp({
      git: context.git,
      commit: context.commit,
      kit: 'api',
      directory: context.t,
      seedLockfile: Buffer.from('seed\n'),
      frozenLockfile: true,
      includeVendor: false,
      runner,
      env: constructedEnvironment(),
      log: () => {},
    })
    assert.equal(calls[0].args.join(' '), 'install --frozen-lockfile')
    assert.equal(
      result.files.find((entry) => entry.path === 'pnpm-lock.yaml')!.bytes.toString(),
      'seed\n'
    )
  })

  test('fails and lists source files the commands changed or added', async ({ assert }) => {
    const { runner } = fakeRunner({
      '--force': ({ cwd }) => {
        writeFileSync(join(cwd, 'start/routes.ts'), 'changed\n')
        writeFileSync(join(cwd, 'start/extra.ts'), 'new\n')
      },
    })
    await assert.rejects(
      () =>
        regenerateApp({
          git: context.git,
          commit: context.commit,
          kit: 'api',
          directory: context.t,
          seedLockfile: null,
          frozenLockfile: false,
          includeVendor: false,
          runner,
          env: constructedEnvironment(),
          log: () => {},
        }),
      exactly(
        'Regenerating api changed files that are not generated:\n  changed start/routes.ts\n  new start/extra.ts'
      )
    )
  })

  test('the constructed environment drops ACCOUNT_KIT_ variables', ({ assert }) => {
    process.env.ACCOUNT_KIT_AUTH_STRATEGY = 'session'
    try {
      const env = constructedEnvironment({ ACCOUNT_KIT_USERS_TABLE: 'people', EXTRA: 'yes' })
      assert.deepEqual(Object.keys(env).sort(), ['EXTRA', 'HOME', 'HOST', 'LIMITER_STORE', 'PATH'])
      assert.equal(env.HOST, '127.0.0.1')
      assert.equal(env.LIMITER_STORE, 'memory')
    } finally {
      delete process.env.ACCOUNT_KIT_AUTH_STRATEGY
    }
  })

  test('restores a deleted .env.example', async ({ assert }) => {
    const { runner } = fakeRunner({
      '--force': ({ cwd }) => rmSync(join(cwd, '.env.example'), { force: true }),
    })
    const logged: string[] = []
    await regenerateApp({
      git: context.git,
      commit: context.commit,
      kit: 'api',
      directory: context.t,
      seedLockfile: null,
      frozenLockfile: false,
      includeVendor: false,
      runner,
      env: constructedEnvironment(),
      log: (line) => logged.push(line),
    })
    assert.deepEqual(logged, ['restored .env.example (api)'])
  })
})

test.group('compare', (group) => {
  let directory: string
  group.each.setup(() => {
    directory = temporaryDirectory()
    return () => rmSync(directory, { recursive: true, force: true })
  })

  test('reports added, removed and changed paths by mode and bytes', ({ assert }) => {
    writeFiles(directory, {
      'same.ts': 'same\n',
      'bytes.ts': 'old\n',
      'mode.ts': 'mode\n',
      'extra.ts': 'extra\n',
      'ignored.log': 'ignored by the app\n',
      'node_modules/x/index.js': 'installed\n',
      '.env': 'APP_KEY=x\n',
    })
    const output = [
      { path: 'same.ts', executable: false, bytes: Buffer.from('same\n') },
      { path: 'bytes.ts', executable: false, bytes: Buffer.from('new\n') },
      { path: 'mode.ts', executable: true, bytes: Buffer.from('mode\n') },
      { path: 'missing.ts', executable: false, bytes: Buffer.from('missing\n') },
      { path: 'link.ts', executable: true, bytes: Buffer.from('same\n') },
    ]
    symlinkSync('same.ts', join(directory, 'link.ts'))
    const differences = compareOutput(output, directory)
    assert.deepEqual(differences, [
      { path: 'bytes.ts', kind: 'changed' },
      { path: 'extra.ts', kind: 'removed' },
      { path: 'ignored.log', kind: 'removed' },
      { path: 'link.ts', kind: 'changed' },
      { path: 'missing.ts', kind: 'added' },
      { path: 'mode.ts', kind: 'changed' },
    ])
    assert.equal(readFileSync(join(directory, 'bytes.ts'), 'utf8'), 'old\n')
  })
})
