import { test } from '@japa/runner'
import { mkdirSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { listFiles } from '../../src/file_tree.ts'
import {
  RepositoryCache,
  localPackageSource,
  readBaseKit,
  taggedPackageSource,
} from '../../src/tree_source.ts'
import { exactly } from '../helpers/exact_message.ts'
import { FixtureWorld, kitFiles, temporaryDirectory, writeFiles } from '../helpers/fixture_repos.ts'

test.group('tree sources', (group) => {
  let world: FixtureWorld
  let cache: RepositoryCache
  group.each.setup(() => {
    world = new FixtureWorld()
    cache = new RepositoryCache(join(world.sandboxRoot, 'tmp/cache/repos'), world.remoteUrlFor)
    return () => world.cleanup()
  })

  test('reads one base kit at a commit', ({ assert }) => {
    const commit = world.publishBase({ api: kitFiles('api'), hypermedia: kitFiles('hypermedia') })
    const destination = join(world.directory, 'out')
    mkdirSync(destination)
    readBaseKit(cache, { repository: 'adonisjs/starter-kits', commit }, 'api', destination)
    assert.equal(readFileSync(join(destination, 'README.md'), 'utf8'), '# api\n')
    assert.isTrue(statSync(join(destination, 'bin/server.ts')).mode & 0o100 ? true : false)
    assert.isFalse(existsSync(join(destination, 'hypermedia')))
  })

  test('reads a folder and single files at a tag', ({ assert }) => {
    world.publishPackage({
      name: '@kevinjohn/adonisjs-account-kit',
      repository: 'Kevinjohn/oss-adonisjs-account-kit',
      version: '0.3.1',
      examples: { api: { path: 'examples/api', files: kitFiles('api') } },
    })
    world.commit('Kevinjohn/oss-adonisjs-account-kit', {
      'examples/api/later.ts': 'after the tag\n',
    })
    const source = taggedPackageSource(cache, 'Kevinjohn/oss-adonisjs-account-kit', '0.3.1')
    const destination = join(world.directory, 'out')
    mkdirSync(destination)
    source.copyFolder('examples/api', destination)

    assert.equal(source.description, 'Kevinjohn/oss-adonisjs-account-kit@v0.3.1')
    assert.isTrue(existsSync(join(destination, 'adonisrc.ts')))
    assert.isFalse(existsSync(join(destination, 'later.ts')))
    assert.isTrue(statSync(join(destination, 'bin/server.ts')).mode & 0o100 ? true : false)
    assert.equal(
      JSON.parse(source.readFile('package.json')!.toString()).name,
      '@kevinjohn/adonisjs-account-kit'
    )
    assert.equal(
      source.readFile('examples/api/pnpm-lock.yaml')!.toString(),
      "lockfileVersion: '9.0'\n"
    )
    assert.isNull(source.readFile('examples/api/missing.ts'))
    assert.isTrue(source.hasFolder('examples/api'))
    assert.isFalse(source.hasFolder('examples/vue'))
  })

  test('reads a local checkout with uncommitted files and without deleted ones', ({ assert }) => {
    world.commit('Kevinjohn/oss-adonisjs-account-kit', {
      'package.json': '{}\n',
      ...Object.fromEntries(
        Object.entries(kitFiles('api')).map(([path, spec]) => [`examples/api/${path}`, spec])
      ),
    })
    const root = world.workPath('Kevinjohn/oss-adonisjs-account-kit')
    writeFiles(root, {
      'examples/api/app/new_file.ts': 'not committed yet\n',
      'examples/api/node_modules/ignored.js': 'ignored by .gitignore\n',
    })
    rmSync(join(root, 'examples/api/start/routes.ts'))

    const destination = join(world.directory, 'out')
    mkdirSync(destination)
    localPackageSource(root).copyFolder('examples/api', destination)
    const paths = listFiles(destination).map((entry) => entry.path)

    assert.include(paths, 'app/new_file.ts')
    assert.notInclude(paths, 'start/routes.ts')
    assert.notInclude(paths, 'node_modules/ignored.js')
    assert.isTrue(statSync(join(destination, 'bin/server.ts')).mode & 0o100 ? true : false)
  })

  test('copies a local symlink as a symlink', ({ assert }) => {
    const root = temporaryDirectory()
    world.commit('Kevinjohn/oss-adonisjs-account-kit', {
      'examples/api/adonisrc.ts': 'x\n',
      'examples/api/link.ts': { symlink: 'adonisrc.ts' },
    })
    const destination = join(root, 'out')
    mkdirSync(destination)
    localPackageSource(world.workPath('Kevinjohn/oss-adonisjs-account-kit')).copyFolder(
      'examples/api',
      destination
    )
    assert.deepEqual(
      listFiles(destination).map((entry) => [entry.path, entry.kind]),
      [
        ['adonisrc.ts', 'file'],
        ['link.ts', 'symlink'],
      ]
    )
    rmSync(root, { recursive: true, force: true })
  })

  test('fetches the tag on every run, so a moved tag fails', ({ assert }) => {
    world.publishPackage({
      name: '@kevinjohn/adonisjs-account-kit',
      repository: 'Kevinjohn/oss-adonisjs-account-kit',
      version: '0.3.1',
      examples: { api: { path: 'examples/api', files: kitFiles('api') } },
    })
    const read = () => {
      const destination = temporaryDirectory()
      try {
        taggedPackageSource(cache, 'Kevinjohn/oss-adonisjs-account-kit', '0.3.1').copyFolder(
          'examples/api',
          destination
        )
      } finally {
        rmSync(destination, { recursive: true, force: true })
      }
    }
    read()
    world.commit('Kevinjohn/oss-adonisjs-account-kit', { 'examples/api/moved.ts': 'moved\n' })
    world.tag('Kevinjohn/oss-adonisjs-account-kit', 'v0.3.1')
    assert.throws(
      read,
      exactly(
        'v0.3.1 of Kevinjohn/oss-adonisjs-account-kit moved since it was cached. Releases must not move; if this one had to, delete tmp/cache/repos and run again.'
      )
    )
  })

  test('extraction ignores TAR_OPTIONS', ({ assert }) => {
    const commit = world.publishBase({ api: kitFiles('api') })
    const destination = join(world.directory, 'out')
    mkdirSync(destination)
    process.env.TAR_OPTIONS = '--exclude=package.json'
    try {
      readBaseKit(cache, { repository: 'adonisjs/starter-kits', commit }, 'api', destination)
    } finally {
      delete process.env.TAR_OPTIONS
    }
    assert.isTrue(existsSync(join(destination, 'package.json')))
  })
})
