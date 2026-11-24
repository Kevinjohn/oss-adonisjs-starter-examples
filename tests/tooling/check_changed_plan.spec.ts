import { test } from '@japa/runner'
import { countTests, planChecks, describeStepFailure } from '../../src/check_changed_plan.ts'

const changed = (...paths: string[]) => paths.map((path) => ({ path, deleted: false }))
const summary = (steps: ReturnType<typeof planChecks>) =>
  Object.fromEntries(steps.map((step) => [step.id, step.command ?? `skip: ${step.skip}`]))
const appCommand = (kit: string) => [
  'pnpm',
  'test:app',
  '--kit',
  kit,
  ...(kit === 'api' ? [] : ['--install-browsers']),
]

test.group('check:changed plan', () => {
  test('an app runner source change runs the suite and all four released apps', ({ assert }) => {
    const steps = summary(planChecks(changed('src/app_test.ts')))
    assert.deepEqual(steps.tests, ['pnpm', 'test'])
    for (const kit of ['api', 'hypermedia', 'inertia-react', 'inertia-vue'])
      assert.deepEqual(steps[`app-${kit}`], appCommand(kit))
    assert.isFalse('assemble-check' in steps)
  })

  test('an app change runs that app only', ({ assert }) => {
    const steps = summary(planChecks(changed('apps/api/start/routes.ts')))
    assert.deepEqual(steps['app-api'], appCommand('api'))
    for (const kit of ['hypermedia', 'inertia-react', 'inertia-vue'])
      assert.isFalse(`app-${kit}` in steps)
  })

  test('a changed spec runs on its own without an app job', ({ assert }) => {
    const steps = summary(planChecks(changed('tests/tooling/app_test.spec.ts')))
    assert.deepEqual(steps.tests, ['pnpm', 'test', '--files=tests/tooling/app_test.spec.ts'])
    assert.isFalse('app-api' in steps)
  })

  test('shared test helpers and manifests run the full suite', ({ assert }) => {
    for (const path of ['tests/helpers/fake_runner.ts', 'bin/test_app.ts', 'package.json'])
      assert.deepEqual(summary(planChecks(changed(path))).tests, ['pnpm', 'test'], path)
  })

  test('static checks name omitted app jobs', ({ assert }) => {
    const steps = summary(
      planChecks(changed('src/app_test.ts', 'tests/tooling/app_test.spec.ts'), { static: true })
    )
    assert.deepEqual(steps.tests, ['pnpm', 'test', '--files=tests/tooling/app_test.spec.ts'])
    assert.equal(steps['full-suite'], 'skip: --static leaves it out')
    assert.equal(steps['app-checks'], 'skip: --static leaves them out')
  })

  test('a cookbook change runs the sourced snippet check', ({ assert }) => {
    const steps = summary(planChecks(changed('docs/cookbook/example.md')))
    assert.isArray(steps.format)
    assert.deepEqual(steps.tests, ['pnpm', 'test', '--files=tests/docs_sources.spec.ts'])
    assert.isFalse('app-api' in steps)
  })
})

test.group('check:changed results', () => {
  const step = { timeoutMs: 60_000, tests: 'japa' as const }

  test('counts the tests Japa reported', ({ assert }) => {
    assert.equal(countTests('\u001b[32m Tests \u001b[39m 3 passed (3)\n'), 3)
    assert.isUndefined(countTests('no summary'))
  })

  test('a test step that ran no tests fails', ({ assert }) => {
    assert.equal(
      describeStepFailure(step, { code: 0, timedOut: false, output: '' }),
      'ran no tests'
    )
    assert.equal(
      describeStepFailure(step, { code: 0, timedOut: false, output: 'Tests  2 skipped (2)' }),
      'ran no tests'
    )
    assert.isUndefined(
      describeStepFailure(step, { code: 0, timedOut: false, output: 'Tests  1 passed (1)' })
    )
  })

  test('a failing or stopped step fails', ({ assert }) => {
    assert.equal(describeStepFailure(step, { code: 1, timedOut: false, output: '' }), 'exit 1')
    assert.equal(
      describeStepFailure(step, { code: null, timedOut: true, output: '' }),
      'stopped after 1 minutes'
    )
  })
})
