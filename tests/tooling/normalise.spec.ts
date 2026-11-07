import { test } from '@japa/runner'
import { rmSync } from 'node:fs'
import { copyOverlay, normalisePackageJson, renderAppReadme } from '../../src/normalise.ts'
import { exactly } from '../helpers/exact_message.ts'
import { temporaryDirectory, writeFiles } from '../helpers/fixture_repos.ts'

const URL =
  'https://github.com/Kevinjohn/oss-adonisjs-account-kit/releases/download/v0.3.1/kevinjohn-adonisjs-account-kit-0.3.1.tgz'

test.group('normalise', () => {
  test('rewrites names, scripts and install maps but not peers', ({ assert }) => {
    const result = normalisePackageJson(
      {
        name: 'account-kit-api-example',
        scripts: { 'test': 'node ace test', 'kit:pack': 'pnpm pack' },
        dependencies: {
          'luxon': '^3.0.0',
          '@kevinjohn/adonisjs-account-kit': 'file:vendor/x.tgz',
          '@adonisjs/core': '^7.0.0',
        },
        peerDependencies: {
          '@kevinjohn/adonisjs-account-kit': '0.3.1',
          '@adonisjs/auth': '^10.0.0',
        },
      },
      'api',
      new Map([['@kevinjohn/adonisjs-account-kit', URL]])
    )
    assert.equal(result.name, 'adonisjs-starter-examples-api')
    assert.deepEqual(result.scripts, { test: 'node ace test' })
    assert.deepEqual(Object.entries(result.dependencies), [
      ['@adonisjs/core', '^7.0.0'],
      ['@kevinjohn/adonisjs-account-kit', URL],
      ['luxon', '^3.0.0'],
    ])
    assert.deepEqual(result.peerDependencies, {
      '@adonisjs/auth': '^10.0.0',
      '@kevinjohn/adonisjs-account-kit': '0.3.1',
    })
  })

  test('fails on one of our packages that is not in the kit', ({ assert }) => {
    assert.throws(
      () =>
        normalisePackageJson(
          { devDependencies: { '@kevinjohn/adonisjs-masquerade': 'file:vendor/m.tgz' } },
          'api',
          new Map()
        ),
      exactly(
        'api app depends on @kevinjohn/adonisjs-masquerade, which is not in the sandbox for this kit'
      )
    )
  })

  test('renders the README template', ({ assert }) => {
    const readme = renderAppReadme('# {{kit}}\n{{baseCommit}}\n{{packagesTable}}\n', {
      kit: 'api',
      baseCommit: 'abc',
      packages: [
        {
          name: '@kevinjohn/adonisjs-account-kit',
          version: '0.3.1',
          url: 'https://x/examples/api',
        },
      ],
    })
    assert.equal(
      readme,
      [
        '# api',
        'abc',
        '| Package                           | Version | Example                           |',
        '| --------------------------------- | ------- | --------------------------------- |',
        '| `@kevinjohn/adonisjs-account-kit` | 0.3.1   | [example](https://x/examples/api) |',
        '',
      ].join('\n')
    )
  })

  test('copies an overlay and fails when a file already exists', ({ assert }) => {
    const directory = temporaryDirectory()
    writeFiles(directory, {
      'overlay/tests/combined.spec.ts': 'test\n',
      'app/start/routes.ts': 'routes\n',
      'clash/start/routes.ts': 'other\n',
    })
    copyOverlay(`${directory}/overlay`, `${directory}/app`, 'api')
    assert.throws(
      () => copyOverlay(`${directory}/clash`, `${directory}/app`, 'api'),
      exactly('Overlay file start/routes.ts already exists in api')
    )
    rmSync(directory, { recursive: true, force: true })
  })

  test('refuses runtime files in an overlay', ({ assert }) => {
    const directory = temporaryDirectory()
    writeFiles(directory, { 'overlay/vendor/extra.tgz': 'x', 'app/start/routes.ts': 'routes\n' })
    assert.throws(
      () => copyOverlay(`${directory}/overlay`, `${directory}/app`, 'api'),
      exactly('Unexpected vendor/extra.tgz in the api overlay')
    )
    rmSync(directory, { recursive: true, force: true })
  })
})
