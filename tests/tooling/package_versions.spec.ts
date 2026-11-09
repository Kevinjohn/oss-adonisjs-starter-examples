import { test } from '@japa/runner'
import {
  displayName,
  recordVersions,
  setConfigVersions,
  setSpecificationVersions,
} from '../../src/package_versions.ts'
import type { PackageConfig } from '../../src/sandbox_config.ts'
import { accountKitConfig } from '../helpers/fixture_repos.ts'

const BASE = '46d235932e3eb6472a16b740fa0b47b5f69fc6fc'

/** A valid sandbox: Account Kit 0.3.1 and Masquerade 0.2.1 built on it. */
function sandbox(): any {
  const value: any = structuredClone(accountKitConfig(BASE))
  value.packages.push({
    name: '@kevinjohn/adonisjs-masquerade',
    repository: 'Kevinjohn/oss-adonisjs-masquerade',
    version: '0.2.1',
    buildsOn: '@kevinjohn/adonisjs-account-kit',
    builtOn: { base: BASE, predecessorVersion: '0.3.1' },
    kits: { api: 'examples/with_account_kit/api' },
    exclude: [],
  })
  return value
}

const kit = '@kevinjohn/adonisjs-account-kit'
const masquerade = '@kevinjohn/adonisjs-masquerade'

const config = `{
  "packages": [
    {
      "name": "@kevinjohn/adonisjs-account-kit",
      "version": "0.3.4",
      "buildsOn": null,
      "builtOn": { "base": "b", "predecessorVersion": null }
    },
    {
      "name": "@kevinjohn/adonisjs-masquerade",
      "version": "0.2.8",
      "buildsOn": "@kevinjohn/adonisjs-account-kit",
      "builtOn": { "base": "b", "predecessorVersion": "0.3.4" }
    },
    {
      "name": "@kevinjohn/adonisjs-access-control",
      "version": "0.1.7",
      "buildsOn": "@kevinjohn/adonisjs-account-kit",
      "builtOn": { "base": "b", "predecessorVersion": "0.3.4" }
    }
  ]
}
`

const current = [
  { name: '@kevinjohn/adonisjs-account-kit', version: '0.3.4' },
  { name: '@kevinjohn/adonisjs-masquerade', version: '0.2.8' },
] as PackageConfig[]

test.group('package versions', () => {
  test('sets the version and predecessor of only the named packages', ({ assert }) => {
    const result = JSON.parse(
      setConfigVersions(config, [
        { name: '@kevinjohn/adonisjs-account-kit', version: '0.3.10', predecessorVersion: null },
        { name: '@kevinjohn/adonisjs-masquerade', version: '0.2.9', predecessorVersion: '0.3.10' },
      ])
    )

    assert.deepEqual(
      result.packages.map((entry: any) => [entry.version, entry.builtOn.predecessorVersion]),
      [
        ['0.3.10', null],
        ['0.2.9', '0.3.10'],
        ['0.1.7', '0.3.4'],
      ]
    )
  })

  test('refuses a package the sandbox does not list', ({ assert }) => {
    assert.throws(
      () =>
        setConfigVersions(config, [
          { name: '@kevinjohn/adonisjs-other', version: '1.0.0', predecessorVersion: null },
        ]),
      '@kevinjohn/adonisjs-other is not in the sandbox'
    )
  })

  test('refuses a predecessor for a package that builds on nothing', ({ assert }) => {
    assert.throws(
      () =>
        setConfigVersions(config.replace('"predecessorVersion": null', '"other": null'), [
          {
            name: '@kevinjohn/adonisjs-account-kit',
            version: '0.3.5',
            predecessorVersion: '0.0.1',
          },
        ]),
      '@kevinjohn/adonisjs-account-kit has no builtOn.predecessorVersion'
    )
  })

  test('updates the specification table, example entry and prose', ({ assert }) => {
    const specification = [
      '      "name": "@kevinjohn/adonisjs-account-kit",',
      '      "version": "0.3.4",',
      '',
      '| Account Kit    | 0.3.4   | `examples/api`                  |',
      '| Masquerade     | 0.2.8   | `examples/with_account_kit/api` |',
      '| Soft Delete    | 0.3.4   | `examples/starter/api`          |',
      '',
      'Control are based on Account Kit 0.3.4; Account Kit 0.3.40 stays.',
    ].join('\n')

    assert.equal(
      setSpecificationVersions(specification, current, [
        { name: '@kevinjohn/adonisjs-account-kit', version: '0.3.10', predecessorVersion: null },
        { name: '@kevinjohn/adonisjs-masquerade', version: '0.2.9', predecessorVersion: '0.3.10' },
      ]),
      [
        '      "name": "@kevinjohn/adonisjs-account-kit",',
        '      "version": "0.3.10",',
        '',
        '| Account Kit    | 0.3.10  | `examples/api`                  |',
        '| Masquerade     | 0.2.9   | `examples/with_account_kit/api` |',
        '| Soft Delete    | 0.3.4   | `examples/starter/api`          |',
        '',
        'Control are based on Account Kit 0.3.10; Account Kit 0.3.40 stays.',
      ].join('\n')
    )
  })

  test('names packages as the specification does', ({ assert }) => {
    assert.equal(displayName('@kevinjohn/adonisjs-access-control'), 'Access Control')
    assert.equal(displayName('@kevinjohn/adonisjs-lucid-soft-delete'), 'Soft Delete')
  })
})

test.group('record versions', () => {
  test('records a release and the release built on it together', ({ assert }) => {
    const recorded = recordVersions(JSON.stringify(sandbox(), null, 2), '', [
      { name: kit, version: '0.3.2', predecessorVersion: null },
      { name: masquerade, version: '0.2.2', predecessorVersion: '0.3.2' },
    ])
    const packages = JSON.parse(recorded.config).packages
    assert.deepEqual(
      packages.map((entry: any) => [entry.version, entry.builtOn.predecessorVersion]),
      [
        ['0.3.2', null],
        ['0.2.2', '0.3.2'],
      ]
    )
  })

  test('refuses to leave a package built on an older predecessor', ({ assert }) => {
    assert.throws(
      () =>
        recordVersions(JSON.stringify(sandbox(), null, 2), '', [
          { name: kit, version: '0.3.2', predecessorVersion: null },
        ]),
      `${masquerade} examples were copied from ${kit}@0.3.1; the sandbox uses ${kit}@0.3.2. Re-copy or rebase them (16.5).`
    )
  })

  test('refuses a package named twice', ({ assert }) => {
    assert.throws(
      () =>
        recordVersions(JSON.stringify(sandbox(), null, 2), '', [
          { name: kit, version: '0.3.2', predecessorVersion: null },
          { name: kit, version: '0.3.3', predecessorVersion: null },
        ]),
      `${kit} is named twice`
    )
  })

  test('refuses a rewrite that lands on another package', ({ assert }) => {
    const reordered = sandbox()
    reordered.packages = reordered.packages.map(({ version, ...rest }: any) => ({
      version,
      ...rest,
    }))
    assert.throws(
      () =>
        recordVersions(JSON.stringify(reordered, null, 2), '', [
          { name: kit, version: '0.3.1', predecessorVersion: null },
        ]),
      `Recording the releases changed ${masquerade}, which was not named`
    )
  })
})
