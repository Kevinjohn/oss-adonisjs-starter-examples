import { test } from '@japa/runner'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createWorkDirectory, mergeKit } from '../../src/assembly.ts'
import { unsupportedReason } from '../../src/merge.ts'
import { resolvePendingConflicts } from '../../src/resolutions.ts'
import { pruneUnusedResolutions } from '../../src/resolve_command.ts'
import { listFiles } from '../../src/file_tree.ts'
import { Git } from '../../src/git.ts'
import { exactly } from '../helpers/exact_message.ts'
import type { FileSpec } from '../helpers/fixture_repos.ts'
import { ACCOUNT_KIT, SOFT_DELETE, SandboxFixture } from '../helpers/sandbox_fixture.ts'

const ROUTES =
  "import router from '@adonisjs/core/services/router'\n\nrouter.get('/', () => 'ok')\n"

/** Account Kit and Lucid Soft Delete, both on the base, so their changes really merge. */
function twoPackages(
  fixture: SandboxFixture,
  ak: FileSpec,
  softDelete: FileSpec,
  softDeleteVersion = '0.1.4'
) {
  fixture.publish({ name: ACCOUNT_KIT, version: '0.3.1', changes: () => ak })
  fixture.publish({ name: SOFT_DELETE, version: softDeleteVersion, changes: () => softDelete })
}

let lastMerge: ReturnType<typeof mergeKit> | undefined

function merge(fixture: SandboxFixture) {
  lastMerge = mergeKit({
    root: fixture.root,
    config: fixture.config,
    kit: 'api',
    work: createWorkDirectory(fixture.root, 'api'),
    remoteUrlFor: fixture.world.remoteUrlFor,
  })
  return lastMerge
}

/** The file content on the app branch of the last merge, or null. */
function appFile(path: string): string | null {
  const git = lastMerge!.context.git
  const result = git.run(['show', `app:${path}`], { allowFailure: true })
  return result.code === 0 ? result.stdout.toString('utf8') : null
}

function pending(fixture: SandboxFixture, path: string) {
  const file = join(fixture.root, 'tmp/conflicts/api/lucid-soft-delete', path)
  return {
    file,
    content: existsSync(file) ? readFileSync(file, 'utf8') : null,
    inputs: existsSync(`${file}.inputs.json`)
      ? JSON.parse(readFileSync(`${file}.inputs.json`, 'utf8'))
      : null,
  }
}

function resolve(fixture: SandboxFixture, deletes: string[] = []) {
  return resolvePendingConflicts({
    pendingRoot: join(fixture.root, 'tmp/conflicts'),
    resolutionsRoot: join(fixture.root, 'resolutions'),
    kit: 'api',
    deletes,
  })
}

const conflictingRoutes = {
  ak: { 'start/routes.ts': `${ROUTES}router.get('/account', () => 'ak')\n` },
  softDelete: { 'start/routes.ts': `${ROUTES}router.get('/trash', () => 'sd')\n` },
}

test.group('merging', (group) => {
  let fixture: SandboxFixture
  group.each.setup(() => {
    fixture = new SandboxFixture()
    return () => fixture.cleanup()
  })

  test('commits package.json once when both sides add the same key at different places', ({
    assert,
  }) => {
    const manifest = (scripts: Record<string, string>) =>
      `${JSON.stringify({ name: 'api', private: true, type: 'module', scripts }, null, 2)}\n`
    twoPackages(
      fixture,
      { 'package.json': manifest({ test: 'node ace test', extra: 'x' }) },
      { 'package.json': manifest({ extra: 'x', test: 'node ace test' }) }
    )
    const { outcome, context } = merge(fixture)
    assert.isTrue(outcome.ok)
    assert.equal(appFile('package.json')!.match(/"extra"/g)!.length, 1)
    assert.equal(context.git.text(['status', '--porcelain']), '')
  })

  test('treats a rename against an edit as plain path changes', ({ assert }) => {
    twoPackages(
      fixture,
      { 'start/routes.ts': null, 'start/router.ts': ROUTES },
      { 'start/routes.ts': `${ROUTES}router.get('/trash', () => 'sd')\n` }
    )
    const { outcome } = merge(fixture)
    assert.isFalse(outcome.ok)
    const conflict = pending(fixture, 'start/routes.ts')
    assert.isNull(conflict.inputs.ours)
    assert.isNotNull(conflict.inputs.base)
    assert.isNotNull(conflict.inputs.theirs)
    assert.deepEqual(
      listFiles(join(fixture.root, 'tmp/conflicts')).map((entry) => entry.path),
      ['api/lucid-soft-delete/start/routes.ts', 'api/lucid-soft-delete/start/routes.ts.inputs.json']
    )
  })

  test('writes a pending conflict, aborts and reports when no resolution matches', ({ assert }) => {
    twoPackages(fixture, conflictingRoutes.ak, conflictingRoutes.softDelete)
    const { outcome, context } = merge(fixture)
    assert.isFalse(outcome.ok)
    if (outcome.ok) return
    assert.equal(
      outcome.report,
      [
        'Merging lucid-soft-delete@0.1.4 into api left 1 conflict(s):',
        `  ${join(fixture.root, 'tmp/conflicts/api/lucid-soft-delete/start/routes.ts')}`,
        'Edit each file to the merged content and remove every conflict marker. Then run',
        '  pnpm resolve --kit api',
        'and add --delete <path> for a file that should not exist. Then run pnpm assemble again.',
      ].join('\n')
    )
    const conflict = pending(fixture, 'start/routes.ts')
    assert.match(conflict.content!, /^<<<<<<< ours$/m)
    assert.match(conflict.content!, /^\|\|\|\|\|\|\| base$/m)
    assert.equal(conflict.inputs.result, null)
    assert.isFalse(existsSync(join(fixture.root, 'resolutions')))
    assert.isFalse(
      existsSync(join(context.git.text(['rev-parse', '--absolute-git-dir']), 'MERGE_HEAD'))
    )
  })

  test('resolve refuses a file with markers and copies nothing', ({ assert }) => {
    twoPackages(fixture, conflictingRoutes.ak, conflictingRoutes.softDelete)
    merge(fixture)
    assert.throws(() => resolve(fixture), /still has conflict markers/)
    assert.isFalse(existsSync(join(fixture.root, 'resolutions')))
    assert.isNotNull(pending(fixture, 'start/routes.ts').content)
  })

  test('a saved resolution makes the next merge succeed', ({ assert }) => {
    twoPackages(fixture, conflictingRoutes.ak, conflictingRoutes.softDelete)
    merge(fixture)
    const merged = `${ROUTES}router.get('/account', () => 'ak')\nrouter.get('/trash', () => 'sd')\n`
    writeFileSync(pending(fixture, 'start/routes.ts').file, merged)
    resolve(fixture)

    const saved = JSON.parse(
      readFileSync(
        join(fixture.root, 'resolutions/api/lucid-soft-delete/start/routes.ts.inputs.json'),
        'utf8'
      )
    )
    assert.equal(saved.result, 'content')
    assert.isNull(pending(fixture, 'start/routes.ts').inputs)
    const { outcome, context } = merge(fixture)
    assert.isTrue(outcome.ok)
    assert.equal(appFile('start/routes.ts'), merged)
    assert.deepEqual(context.store.unused(), [])
  })

  test('--delete records a deletion and removes the file', ({ assert }) => {
    twoPackages(fixture, conflictingRoutes.ak, conflictingRoutes.softDelete)
    merge(fixture)
    resolve(fixture, ['start/routes.ts'])
    const folder = join(fixture.root, 'resolutions/api/lucid-soft-delete/start')
    assert.equal(
      JSON.parse(readFileSync(join(folder, 'routes.ts.inputs.json'), 'utf8')).result,
      'delete'
    )
    assert.isFalse(existsSync(join(folder, 'routes.ts')))
    assert.isTrue(merge(fixture).outcome.ok)
    assert.isNull(appFile('start/routes.ts'))
  })

  test('a changed input makes the resolution unused and the conflict pending again', ({
    assert,
  }) => {
    twoPackages(fixture, conflictingRoutes.ak, conflictingRoutes.softDelete)
    merge(fixture)
    writeFileSync(pending(fixture, 'start/routes.ts').file, ROUTES)
    resolve(fixture)

    fixture.publish({
      name: SOFT_DELETE,
      version: '0.1.5',
      changes: () => ({ 'start/routes.ts': `${ROUTES}router.get('/bin', () => 'sd')\n` }),
    })
    const { outcome, context } = merge(fixture)
    assert.isFalse(outcome.ok)
    assert.deepEqual(context.store.unused(), ['lucid-soft-delete/start/routes.ts'])
    assert.isNotNull(pending(fixture, 'start/routes.ts').content)
  })

  test('--prune-unused deletes unused resolutions only when every merge succeeds', ({ assert }) => {
    twoPackages(fixture, conflictingRoutes.ak, conflictingRoutes.softDelete)
    merge(fixture)
    writeFileSync(pending(fixture, 'start/routes.ts').file, ROUTES)
    resolve(fixture)
    const stale = join(fixture.root, 'resolutions/api/lucid-soft-delete/start/old.ts')
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
    const options = {
      root: fixture.root,
      config: fixture.config,
      kit: 'api' as const,
      remoteUrlFor: fixture.world.remoteUrlFor,
      log: () => {},
    }

    assert.isTrue(pruneUnusedResolutions(options))
    assert.isFalse(existsSync(stale))
    assert.isTrue(
      existsSync(join(fixture.root, 'resolutions/api/lucid-soft-delete/start/routes.ts'))
    )

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
    fixture.publish({
      name: SOFT_DELETE,
      version: '0.1.5',
      changes: () => ({ 'start/routes.ts': `${ROUTES}router.get('/bin', () => 'sd')\n` }),
    })
    assert.isFalse(pruneUnusedResolutions(options))
    assert.isTrue(existsSync(stale))
  })

  test('an add/add conflict uses an empty base', ({ assert }) => {
    twoPackages(fixture, { 'app/shared.ts': 'ak\n' }, { 'app/shared.ts': 'sd\n' })
    assert.isFalse(merge(fixture).outcome.ok)
    const conflict = pending(fixture, 'app/shared.ts')
    assert.isNull(conflict.inputs.base)
    assert.equal(conflict.content, '<<<<<<< ours\nak\n||||||| base\n=======\nsd\n>>>>>>> theirs\n')
  })

  test('a modify/delete conflict becomes pending', ({ assert }) => {
    twoPackages(fixture, { 'start/routes.ts': `${ROUTES}// ak\n` }, { 'start/routes.ts': null })
    assert.isFalse(merge(fixture).outcome.ok)
    const conflict = pending(fixture, 'start/routes.ts')
    assert.isNull(conflict.inputs.theirs)
    assert.isNotNull(conflict.inputs.ours)
  })

  test('fails on a binary conflict', ({ assert }) => {
    twoPackages(
      fixture,
      { 'public/logo.png': Buffer.from([0, 1, 2]) },
      { 'public/logo.png': Buffer.from([0, 3, 4]) }
    )
    assert.throws(
      () => merge(fixture),
      exactly(
        'Unsupported conflict (binary) on public/logo.png while merging lucid-soft-delete@0.1.4. Change the package example so it does not conflict, then run again.'
      )
    )
  })

  test('fails on a mode conflict', ({ assert }) => {
    twoPackages(
      fixture,
      { 'bin/tool.ts': { content: 'a\n', executable: true } },
      { 'bin/tool.ts': 'b\n' }
    )
    assert.throws(
      () => merge(fixture),
      /^Unsupported conflict \(mode\) on bin\/tool\.ts while merging/
    )
  })

  test('fails on a symlink conflict', ({ assert }) => {
    const git = new Git(fixture.root)
    assert.equal(
      unsupportedReason(git, 'AA', {
        2: { mode: '120000', blob: 'x' },
        3: { mode: '120000', blob: 'y' },
      }),
      'symlink'
    )
  })

  test('fails on a file/directory conflict', ({ assert }) => {
    twoPackages(fixture, { 'app/models': 'a file\n' }, { 'app/models/user.ts': 'a folder\n' })
    assert.throws(
      () => merge(fixture),
      exactly(
        'Unsupported conflict (file/directory) on app/models while merging lucid-soft-delete@0.1.4. Change the package example so it does not conflict, then run again.'
      )
    )
  })

  test('a generated-file conflict takes ours', ({ assert }) => {
    twoPackages(
      fixture,
      { 'database/schema.ts': 'export class AccountSchema {}\n' },
      { 'database/schema.ts': 'export class TrashSchema {}\n' }
    )
    assert.isTrue(merge(fixture).outcome.ok)
    assert.equal(appFile('database/schema.ts'), 'export class AccountSchema {}\n')
  })

  test('a package.json conflict is pending with its key paths', ({ assert }) => {
    const manifest = (script: string) =>
      `${JSON.stringify({ name: 'api', private: true, type: 'module', scripts: { test: script } }, null, 2)}\n`
    twoPackages(fixture, { 'package.json': manifest('a') }, { 'package.json': manifest('b') })
    const { outcome } = merge(fixture)
    assert.isFalse(outcome.ok)
    if (!outcome.ok) assert.include(outcome.report, 'package.json (keys: scripts.test)')
    assert.deepEqual(pending(fixture, 'package.json').inputs.conflictingKeys, ['scripts.test'])
  })

  test('writes a pending conflict for a path with a tab', ({ assert }) => {
    twoPackages(fixture, { 'app/a\tb.ts': 'ak\n' }, { 'app/a\tb.ts': 'sd\n' })
    assert.isFalse(merge(fixture).outcome.ok)
    assert.isNotNull(pending(fixture, 'app/a\tb.ts').inputs)
  })

  test('fails on a conflict whose path ends in .inputs.json', ({ assert }) => {
    twoPackages(fixture, { 'data/x.inputs.json': '1\n' }, { 'data/x.inputs.json': '2\n' })
    assert.throws(
      () => merge(fixture),
      exactly(
        'Unsupported conflict (name ends in .inputs.json) on data/x.inputs.json while merging lucid-soft-delete@0.1.4. Change the package example so it does not conflict, then run again.'
      )
    )
  })
})
