import { test } from '@japa/runner'
import { countTests, planChecks, stepProblem } from '../../src/check_changed_plan.ts'

const changed = (...paths: string[]) => paths.map((path) => ({ path, deleted: false }))
const summary = (steps: ReturnType<typeof planChecks>) =>
  Object.fromEntries(steps.map((step) => [step.id, step.command ?? `skip: ${step.skip}`]))

test.group('check:changed plan', () => {
  test('a source file runs every check, the full suite and the assembly check', ({ assert }) => {
    assert.deepEqual(summary(planChecks(changed('src/merge.ts'))), {
      'format': [
        'pnpm',
        'exec',
        'prettier',
        '--check',
        '--ignore-unknown',
        '--no-error-on-unmatched-pattern',
        '--',
        'src/merge.ts',
      ],
      'lint': [
        'pnpm',
        'exec',
        'eslint',
        '--config',
        'eslint.config.js',
        '--max-warnings',
        '0',
        '--no-warn-ignored',
        '--',
        'src/merge.ts',
      ],
      'typecheck': ['pnpm', 'typecheck'],
      'tests': ['pnpm', 'test'],
      'assemble-check': ['pnpm', 'assemble', '--check'],
    })
  })

  test('a changed spec runs on its own', ({ assert }) => {
    const steps = summary(planChecks(changed('tests/tooling/merge.spec.ts')))
    assert.deepEqual(steps.tests, ['pnpm', 'test', '--files=tests/tooling/merge.spec.ts'])
    assert.deepEqual(steps.typecheck, ['pnpm', 'typecheck'])
    assert.equal(steps['assemble-check'], 'skip: nothing assembly reads changed')
  })

  test('shared test helpers and manifests run the full suite', ({ assert }) => {
    for (const path of ['tests/helpers/fixture_repos.ts', 'bin/assemble.ts', 'package.json'])
      assert.deepEqual(summary(planChecks(changed(path))).tests, ['pnpm', 'test'], path)
  })

  test('configuration, resolutions, layers, templates and apps run only the assembly check', ({
    assert,
  }) => {
    for (const path of [
      'config/sandbox.json',
      'resolutions/api/masquerade/start/routes.ts',
      'layers/combined/api/tests/functional/x.spec.ts',
      'templates/app_readme.md',
      'apps/api/start/routes.ts',
      '.gitattributes',
    ]) {
      const steps = summary(planChecks(changed(path)))
      assert.deepEqual(steps['assemble-check'], ['pnpm', 'assemble', '--check'], path)
      assert.equal(steps.tests, 'skip: no spec or tooling file changed', path)
      assert.equal(steps.typecheck, 'skip: no TypeScript or type configuration changed', path)
    }
  })

  test('an app source file is linted against the root configuration, which ignores it', ({
    assert,
  }) => {
    const lint = summary(planChecks(changed('apps/api/start/routes.ts'))).lint
    assert.deepEqual((lint as string[]).slice(3, 5), ['--config', 'eslint.config.js'])
  })

  test('format and lint configuration check the whole repository', ({ assert }) => {
    const steps = summary(planChecks(changed('.prettierignore', 'eslint.config.js')))
    assert.deepEqual(steps.format, ['pnpm', 'format:check'])
    assert.deepEqual(steps.lint, ['pnpm', 'lint'])
  })

  test('a deleted file selects checks but is never passed to a tool', ({ assert }) => {
    const steps = summary(planChecks([{ path: 'src/compare.ts', deleted: true }]))
    assert.equal(steps.format, 'skip: no existing changed files')
    assert.equal(steps.lint, 'skip: no changed source files')
    assert.deepEqual(steps.typecheck, ['pnpm', 'typecheck'])
    assert.deepEqual(steps.tests, ['pnpm', 'test'])
    const deletedSpec = summary(planChecks([{ path: 'tests/tooling/x.spec.ts', deleted: true }]))
    assert.equal(deletedSpec.tests, 'skip: no spec or tooling file changed')
  })

  test('--static leaves out the full suite and the assembly check, and says so', ({ assert }) => {
    const steps = summary(
      planChecks(changed('src/merge.ts', 'tests/tooling/merge.spec.ts'), { static: true })
    )
    assert.deepEqual(steps.tests, ['pnpm', 'test', '--files=tests/tooling/merge.spec.ts'])
    assert.equal(steps['full-suite'], 'skip: --static leaves it out')
    assert.equal(steps['assemble-check'], 'skip: --static leaves it out')
  })

  test('a Markdown change only checks formatting', ({ assert }) => {
    const steps = summary(planChecks(changed('docs/specification.md')))
    assert.isArray(steps.format)
    for (const id of ['lint', 'typecheck', 'tests', 'assemble-check'])
      assert.isString(steps[id], id)
  })
})

test.group('check:changed results', () => {
  const step = { timeoutMs: 60_000, tests: 'japa' as const }

  test('counts the tests Japa reported', ({ assert }) => {
    assert.equal(countTests('\u001b[32m Tests \u001b[39m 3 passed (3)\n'), 3)
    assert.isUndefined(countTests('no summary'))
  })

  test('a test step that ran no tests fails', ({ assert }) => {
    assert.equal(stepProblem(step, { code: 0, timedOut: false, output: '' }), 'ran no tests')
    assert.equal(
      stepProblem(step, { code: 0, timedOut: false, output: 'Tests  2 skipped (2)' }),
      'ran no tests'
    )
    assert.isUndefined(
      stepProblem(step, { code: 0, timedOut: false, output: 'Tests  1 passed (1)' })
    )
  })

  test('a failing or stopped step fails', ({ assert }) => {
    assert.equal(stepProblem(step, { code: 1, timedOut: false, output: '' }), 'exit 1')
    assert.equal(
      stepProblem(step, { code: null, timedOut: true, output: '' }),
      'stopped after 1 minutes'
    )
  })
})
