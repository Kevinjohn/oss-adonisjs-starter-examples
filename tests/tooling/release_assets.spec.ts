import { test } from '@japa/runner'
import {
  assetName,
  releaseAssetUrl,
  shortName,
  unversionedAssetName,
} from '../../src/release_assets.ts'

test.group('release assets', () => {
  const packages: Array<[string, string, string, string]> = [
    [
      '@kevinjohn/adonisjs-account-kit',
      'Kevinjohn/oss-adonisjs-account-kit',
      '0.3.1',
      'account-kit',
    ],
    ['@kevinjohn/adonisjs-masquerade', 'Kevinjohn/oss-adonisjs-masquerade', '0.2.1', 'masquerade'],
    [
      '@kevinjohn/adonisjs-access-control',
      'Kevinjohn/oss-adonisjs-access-control',
      '0.1.2',
      'access-control',
    ],
    [
      '@kevinjohn/adonisjs-lucid-soft-delete',
      'Kevinjohn/oss-adonisjs-lucid-soft-delete',
      '0.1.4',
      'lucid-soft-delete',
    ],
  ]

  for (const [name, repository, version, short] of packages) {
    test(`names the ${short} asset`, ({ assert }) => {
      const file = `kevinjohn-adonisjs-${short}-${version}.tgz`
      assert.equal(assetName(name, version), file)
      assert.equal(unversionedAssetName(name), `kevinjohn-adonisjs-${short}.tgz`)
      assert.equal(
        releaseAssetUrl(repository, name, version),
        `https://github.com/${repository}/releases/download/v${version}/${file}`
      )
      assert.equal(shortName(name), short)
    })
  }
})
