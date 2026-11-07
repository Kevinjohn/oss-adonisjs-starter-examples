import { test } from '@japa/runner'
import { validateSandboxConfig } from '../../src/sandbox_config.ts'
import { exactly } from '../helpers/exact_message.ts'
import { accountKitConfig } from '../helpers/fixture_repos.ts'

const BASE = '46d235932e3eb6472a16b740fa0b47b5f69fc6fc'
const OTHER = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

/** Account Kit plus Masquerade on it, as plain JSON to mutate. */
function config(): any {
  const value: any = structuredClone(accountKitConfig(BASE))
  value.packages.push({
    name: '@kevinjohn/adonisjs-masquerade',
    repository: 'Kevinjohn/oss-adonisjs-masquerade',
    version: '0.2.1',
    buildsOn: '@kevinjohn/adonisjs-account-kit',
    builtOn: { base: BASE, predecessorVersion: '0.3.1' },
    kits: {
      'hypermedia': 'examples/with_account_kit/hypermedia',
      'inertia-react': 'examples/with_account_kit/inertia_react',
    },
    exclude: [],
  })
  return value
}

test.group('sandbox config validation', () => {
  test('accepts a valid config', ({ assert }) => {
    assert.equal(validateSandboxConfig(config()).packages.length, 2)
  })

  const cases: Array<[string, (value: any) => void, string]> = [
    ['schemaVersion', (v) => (v.schemaVersion = 2), 'Unsupported schemaVersion 2'],
    ['base repository', (v) => (v.base.repository = 'someone/kits'), 'Invalid base'],
    ['base commit', (v) => (v.base.commit = 'ABC'), 'Invalid base'],
    ['builtOn base format', (v) => (v.packages[0].builtOn.base = 'short'), 'Invalid base'],
    ['empty kits', (v) => (v.kits = []), 'Invalid kits'],
    ['duplicate kits', (v) => (v.kits = ['api', 'api']), 'Invalid kits'],
    ['unknown kit', (v) => (v.kits = ['api', 'inertia-vue']), 'Invalid kits'],
    ['no packages', (v) => (v.packages = []), 'Invalid package name (no packages)'],
    [
      'name prefix',
      (v) => (v.packages[0].name = '@other/adonisjs-x'),
      'Invalid package name @other/adonisjs-x',
    ],
    [
      'duplicate name',
      (v) => (v.packages[1].name = v.packages[0].name),
      'Invalid package name @kevinjohn/adonisjs-account-kit',
    ],
    [
      'repository',
      (v) => (v.packages[0].repository = 'kevinjohn/x'),
      'Invalid repository kevinjohn/x',
    ],
    ['version', (v) => (v.packages[0].version = '1.0'), 'Invalid version 1.0'],
    [
      'predecessor version',
      (v) => (v.packages[1].builtOn.predecessorVersion = 'v0.3.1'),
      'Invalid version v0.3.1',
    ],
    [
      'buildsOn order',
      (v) => v.packages.reverse(),
      '@kevinjohn/adonisjs-masquerade builds on @kevinjohn/adonisjs-account-kit, which must come earlier',
    ],
    [
      'builtOn without buildsOn',
      (v) => (v.packages[0].builtOn.predecessorVersion = '0.1.0'),
      '@kevinjohn/adonisjs-account-kit builtOn does not match buildsOn',
    ],
    [
      'builtOn base differs',
      (v) => (v.packages[1].builtOn.base = OTHER),
      `@kevinjohn/adonisjs-masquerade examples were copied from base ${OTHER}; the sandbox uses ${BASE}. Rebase them (16.1).`,
    ],
    [
      'predecessor version differs',
      (v) => (v.packages[1].builtOn.predecessorVersion = '0.3.0'),
      '@kevinjohn/adonisjs-masquerade examples were copied from @kevinjohn/adonisjs-account-kit@0.3.0; the sandbox uses @kevinjohn/adonisjs-account-kit@0.3.1. Re-copy or rebase them (16.5).',
    ],
    [
      'kit key not in kits',
      (v) => (v.kits = ['api', 'hypermedia']),
      'Invalid kit path examples/inertia-react',
    ],
    [
      'kit path with ..',
      (v) => (v.packages[0].kits.api = 'examples/../x'),
      'Invalid kit path examples/../x',
    ],
    [
      'absolute kit path',
      (v) => (v.packages[0].kits.api = '/examples/api'),
      'Invalid kit path /examples/api',
    ],
    [
      'kit path backslash',
      (v) => (v.packages[0].kits.api = 'examples\\api'),
      'Invalid kit path examples\\api',
    ],
    [
      'kit missing in predecessor',
      (v) => delete v.packages[0].kits.hypermedia,
      '@kevinjohn/adonisjs-masquerade has hypermedia but @kevinjohn/adonisjs-account-kit does not',
    ],
    ['exclude path', (v) => (v.packages[0].exclude = ['../x/']), 'Invalid exclude ../x/'],
  ]

  for (const [name, mutate, message] of cases) {
    test(`rejects ${name}`, ({ assert }) => {
      const value = config()
      mutate(value)
      assert.throws(() => validateSandboxConfig(value), exactly(message))
    })
  }
})
