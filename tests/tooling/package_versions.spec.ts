import { test } from '@japa/runner'
import {
  displayName,
  setConfigVersions,
  setSpecificationVersions,
} from '../../src/package_versions.ts'
import type { PackageConfig } from '../../src/sandbox_config.ts'

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

  test('updates the specification table, example entry and prose', ({ assert }) => {
    const specification = [
      '      "name": "@kevinjohn/adonisjs-account-kit",',
      '      "version": "0.3.4",',
      '',
      '| Account Kit    | 0.3.4   | `examples/api`                  |',
      '| Masquerade     | 0.2.8   | `examples/with_account_kit/api` |',
      '| Soft Delete    | 0.3.4   | `examples/starter/api`          |',
      '',
      'Control are based on Account Kit 0.3.4; youch 10.3.4 and 0.3.40 stay.',
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
        'Control are based on Account Kit 0.3.10; youch 10.3.4 and 0.3.40 stay.',
      ].join('\n')
    )
  })

  test('names packages as the specification does', ({ assert }) => {
    assert.equal(displayName('@kevinjohn/adonisjs-access-control'), 'Access Control')
    assert.equal(displayName('@kevinjohn/adonisjs-lucid-soft-delete'), 'Soft Delete')
  })
})
