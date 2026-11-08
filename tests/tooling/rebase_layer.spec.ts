import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { listFiles } from '../../src/file_tree.ts'
import { rebaseFolder, rebaseLayer } from '../../src/rebase_layer.ts'
import type { SandboxConfig } from '../../src/sandbox_config.ts'
import { type FileSpec, FixtureWorld, kitFiles, writeFiles } from '../helpers/fixture_repos.ts'

const ACCOUNT_KIT = '@kevinjohn/adonisjs-account-kit'
const MASQUERADE = '@kevinjohn/adonisjs-masquerade'
const KITS = ['api', 'hypermedia'] as const
const PACKAGE_REPO = 'Kevinjohn/oss-adonisjs-masquerade'
const folderOf = (kit: string) => `examples/with_account_kit/${kit}`

/** Account Kit's example for a kit at 0.1.0 and at 0.2.0. */
function accountKitExample(kit: string, version: '0.1.0' | '0.2.0'): FileSpec {
  const files: FileSpec = {
    ...kitFiles(kit),
    'README.md': `# Account Kit ${kit} ${version}\n`,
    'pnpm-lock.yaml': `lockfileVersion: '9.0' # ${version}\n`,
    'start/kit.ts':
      version === '0.1.0' ? "export const kit = 'one'\n" : "export const kit = 'two'\n",
    'start/package_removes.ts': 'export {}\n',
  }
  // A fixture commit keeps earlier files unless they are set to null.
  files['start/kit_removes.ts'] = version === '0.1.0' ? 'export {}\n' : null
  if (version === '0.2.0') files['start/kit_adds.ts'] = 'export {}\n'
  return files
}

/** Masquerade's example: Account Kit 0.1.0's plus its own changes. */
function packageExample(kit: string, extra: FileSpec = {}): FileSpec {
  return {
    ...accountKitExample(kit, '0.1.0'),
    'README.md': `# Masquerade ${kit}\n`,
    'pnpm-lock.yaml': "lockfileVersion: '9.0' # masquerade\n",
    'start/masquerade.ts': 'export const masquerade = true\n',
    'start/package_removes.ts': null,
    ...extra,
  }
}

/** `extra` changes the package's api example only. */
function setup(extra: FileSpec = {}) {
  const world = new FixtureWorld()
  const baseCommit = world.publishBase(Object.fromEntries(KITS.map((kit) => [kit, kitFiles(kit)])))
  for (const version of ['0.1.0', '0.2.0'] as const) {
    world.publishPackage({
      name: ACCOUNT_KIT,
      repository: 'Kevinjohn/oss-adonisjs-account-kit',
      version,
      examples: Object.fromEntries(
        KITS.map((kit) => [
          kit,
          { path: `examples/${kit}`, files: accountKitExample(kit, version) },
        ])
      ),
    })
  }
  const files: FileSpec = {}
  for (const kit of KITS) {
    for (const [path, spec] of Object.entries(packageExample(kit, kit === 'api' ? extra : {})))
      if (spec !== null) files[`${folderOf(kit)}/${path}`] = spec
  }
  world.commit(PACKAGE_REPO, files, 'package')
  const config: SandboxConfig = {
    schemaVersion: 1,
    base: { repository: 'adonisjs/starter-kits', commit: baseCommit },
    kits: [...KITS],
    packages: [
      {
        name: ACCOUNT_KIT,
        repository: 'Kevinjohn/oss-adonisjs-account-kit',
        version: '0.1.0',
        buildsOn: null,
        builtOn: { base: baseCommit, predecessorVersion: null },
        kits: { api: 'examples/api', hypermedia: 'examples/hypermedia' },
        exclude: [],
      },
      {
        name: MASQUERADE,
        repository: PACKAGE_REPO,
        version: '0.1.0',
        buildsOn: ACCOUNT_KIT,
        builtOn: { base: baseCommit, predecessorVersion: '0.1.0' },
        kits: { api: folderOf('api'), hypermedia: folderOf('hypermedia') },
        exclude: [],
      },
    ],
  }
  const lines: string[] = []
  const packageRoot = world.workPath(PACKAGE_REPO)
  const run = () =>
    rebaseLayer({
      root: world.sandboxRoot,
      config,
      packageName: MASQUERADE,
      packageRoot,
      to: { predecessorVersion: '0.2.0' },
      remoteUrlFor: world.remoteUrlFor,
      log: (line) => lines.push(line),
    })
  return { world, packageRoot, run, lines }
}

/** Every file of the package checkout except `.git`, with its contents. */
function snapshot(root: string): Record<string, string> {
  return Object.fromEntries(
    listFiles(root).map((entry) => [entry.path, readFileSync(join(root, entry.path), 'utf8')])
  )
}

test.group('rebase-layer', () => {
  test('moves every kit onto the new predecessor, including deletions', ({ assert, cleanup }) => {
    const { world, packageRoot, run } = setup()
    cleanup(() => world.cleanup())

    assert.isTrue(run())
    for (const kit of KITS) {
      const folder = join(packageRoot, folderOf(kit))
      const read = (path: string) => readFileSync(join(folder, path), 'utf8')
      assert.equal(read('start/kit.ts'), "export const kit = 'two'\n")
      assert.equal(read('start/masquerade.ts'), 'export const masquerade = true\n')
      assert.isTrue(existsSync(join(folder, 'start/kit_adds.ts')))
      assert.isFalse(existsSync(join(folder, 'start/kit_removes.ts')))
      assert.isFalse(existsSync(join(folder, 'start/package_removes.ts')))
      assert.equal(read('README.md'), `# Masquerade ${kit}\n`)
      assert.equal(read('pnpm-lock.yaml'), "lockfileVersion: '9.0' # masquerade\n")
      assert.isTrue(existsSync(join(folder, 'bin/server.ts')))
    }
  })

  test('changes nothing on a conflict, then uses the edited files on the next run', ({
    assert,
    cleanup,
  }) => {
    const { world, packageRoot, run, lines } = setup({
      'start/kit.ts': "export const kit = 'masquerade'\n",
    })
    cleanup(() => world.cleanup())
    const before = snapshot(packageRoot)

    assert.isFalse(run())
    assert.deepEqual(snapshot(packageRoot), before)
    const pending = (kit: string) =>
      join(rebaseFolder(world.sandboxRoot, MASQUERADE), 'conflicts', kit, 'masquerade/start/kit.ts')
    // The hypermedia kit merged cleanly, and is not written either.
    assert.isFalse(existsSync(pending('hypermedia')))
    assert.match(readFileSync(pending('api'), 'utf8'), /^<{7} ours/m)
    writeFiles(join(pending('api'), '..'), {
      'kit.ts': "export const kit = 'two and masquerade'\n",
    })
    assert.isTrue(lines.some((line) => line.includes('Nothing in')))

    assert.isTrue(run())
    const kitFile = (kit: string) =>
      readFileSync(join(packageRoot, folderOf(kit), 'start/kit.ts'), 'utf8')
    assert.equal(kitFile('api'), "export const kit = 'two and masquerade'\n")
    assert.equal(kitFile('hypermedia'), "export const kit = 'two'\n")
    for (const kit of KITS)
      assert.isFalse(existsSync(join(packageRoot, folderOf(kit), 'start/kit_removes.ts')))
    assert.isFalse(existsSync(rebaseFolder(world.sandboxRoot, MASQUERADE)))
  })

  test('a conflict that still has markers stops the next run too', ({ assert, cleanup }) => {
    const { world, run } = setup({ 'start/kit.ts': "export const kit = 'masquerade'\n" })
    cleanup(() => world.cleanup())
    assert.isFalse(run())
    assert.throws(() => run(), /still has conflict markers/)
  })

  test('refuses a checkout with uncommitted changes in an example', ({ assert, cleanup }) => {
    const { world, packageRoot, run } = setup()
    cleanup(() => world.cleanup())
    writeFileSync(join(packageRoot, folderOf('api'), 'start/masquerade.ts'), 'changed\n')
    assert.throws(() => run(), /Commit or stash the changes/)
    assert.equal(
      readFileSync(join(packageRoot, folderOf('api'), 'start/masquerade.ts'), 'utf8'),
      'changed\n'
    )
  })
})
