import { test } from '@japa/runner'
import { rmSync } from 'node:fs'
import { listFiles } from '../../src/file_tree.ts'
import { filterTree } from '../../src/tree_filter.ts'
import { exactly } from '../helpers/exact_message.ts'
import { kitFiles, temporaryDirectory, writeFiles } from '../helpers/fixture_repos.ts'

test.group('tree filter', (group) => {
  let directory: string
  group.each.setup(() => {
    directory = temporaryDirectory()
    writeFiles(directory, kitFiles('api'))
    return () => rmSync(directory, { recursive: true, force: true })
  })

  test('removes the lockfile, root README and excludes, and keeps tmp/.gitkeep', ({ assert }) => {
    writeFiles(directory, {
      'docs/README.md': 'nested readme stays\n',
      'compatibility/package.json': '{}\n',
      'notes.txt': 'excluded file\n',
    })
    filterTree(directory, 'example', ['compatibility/', 'notes.txt'])
    const paths = listFiles(directory).map((entry) => entry.path)
    assert.notInclude(paths, 'pnpm-lock.yaml')
    assert.notInclude(paths, 'README.md')
    assert.notInclude(paths, 'compatibility/package.json')
    assert.notInclude(paths, 'notes.txt')
    assert.include(paths, 'docs/README.md')
    assert.include(paths, 'tmp/.gitkeep')
  })

  const failures: Array<[string, Record<string, any>, string]> = [
    ['vendor/', { 'vendor/kit.tgz': 'x' }, 'Unexpected vendor/kit.tgz in example'],
    ['tmp/db.sqlite3', { 'tmp/db.sqlite3': 'x' }, 'Unexpected tmp/db.sqlite3 in example'],
    ['.env', { '.env': 'APP_KEY=x\n' }, 'Unexpected .env in example'],
    [
      'node_modules/',
      { 'app/node_modules/x.js': 'x' },
      'Unexpected app/node_modules/x.js in example',
    ],
    ['build/', { 'build/server.js': 'x' }, 'Unexpected build/server.js in example'],
    [
      'a symlink',
      { 'start/link.ts': { symlink: 'routes.ts' } },
      'Symlinks are not supported: start/link.ts in example',
    ],
  ]

  for (const [name, files, message] of failures) {
    test(`fails on ${name}`, ({ assert }) => {
      writeFiles(directory, files)
      assert.throws(() => filterTree(directory, 'example'), exactly(message))
    })
  }

  test('a trailing / excludes a directory, not a file of that name', ({ assert }) => {
    writeFiles(directory, { compatibility: 'a file\n' })
    filterTree(directory, 'example', ['compatibility/'])
    assert.include(
      listFiles(directory).map((entry) => entry.path),
      'compatibility'
    )
  })
})
