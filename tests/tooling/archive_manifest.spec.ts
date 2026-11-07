import { test } from '@japa/runner'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type PackedPackage,
  readArchiveManifest,
  runtimePeerMismatches,
} from '../../src/archive_manifest.ts'
import { temporaryDirectory } from '../helpers/fixture_repos.ts'

test.group('archive manifest', () => {
  test('reads package/package.json from a packed archive', ({ assert, cleanup }) => {
    const folder = temporaryDirectory()
    cleanup(() => rmSync(folder, { recursive: true, force: true }))
    mkdirSync(join(folder, 'package/build'), { recursive: true })
    writeFileSync(join(folder, 'package/build/index.js'), 'export {}\n')
    writeFileSync(join(folder, 'package/package.json'), '{"name":"@kevinjohn/a","version":"1.2.3"}')
    execFileSync('tar', ['-czf', join(folder, 'a.tgz'), '-C', folder, 'package'])

    assert.deepEqual(readArchiveManifest(join(folder, 'a.tgz')), {
      name: '@kevinjohn/a',
      version: '1.2.3',
    })
  })

  test('reports exact peers on another packed version, not ranges', ({ assert }) => {
    const packed: PackedPackage[] = [
      { name: '@kevinjohn/a', version: '0.4.0', peerDependencies: {} },
      { name: '@kevinjohn/b', version: '0.2.0', peerDependencies: { '@kevinjohn/a': '0.3.1' } },
      { name: '@kevinjohn/c', version: '0.1.0', peerDependencies: { '@kevinjohn/a': '^0.3.0' } },
      { name: '@kevinjohn/d', version: '0.1.0', peerDependencies: { '@kevinjohn/a': '0.4.0' } },
    ]
    assert.deepEqual(runtimePeerMismatches(packed), [
      'runtime peer mismatch: @kevinjohn/b@0.2.0 peers on @kevinjohn/a 0.3.1; main packs @kevinjohn/a@0.4.0',
    ])
  })
})
