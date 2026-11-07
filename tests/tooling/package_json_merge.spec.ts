import { test } from '@japa/runner'
import { MISSING, mergePackageJson } from '../../src/package_json_merge.ts'

const base = {
  name: 'kit',
  scripts: { test: 'node ace test', lint: 'eslint .' },
  dependencies: { '@adonisjs/core': '^7.0.0' },
}

test.group('package.json structural merge', () => {
  test('merges different added dependencies', ({ assert }) => {
    const ours = { ...base, dependencies: { ...base.dependencies, luxon: '^3.0.0' } }
    const theirs = { ...base, dependencies: { ...base.dependencies, '@vinejs/vine': '^4.0.0' } }
    const result = mergePackageJson(base, ours, theirs)
    assert.deepEqual(result.conflicts, [])
    assert.deepEqual(result.value, {
      ...base,
      dependencies: { '@adonisjs/core': '^7.0.0', 'luxon': '^3.0.0', '@vinejs/vine': '^4.0.0' },
    })
  })

  test('conflicts when the same script changes differently', ({ assert }) => {
    const ours = { ...base, scripts: { ...base.scripts, test: 'node ace test --a' } }
    const theirs = { ...base, scripts: { ...base.scripts, test: 'node ace test --b' } }
    assert.deepEqual(mergePackageJson(base, ours, theirs).conflicts, ['scripts.test'])
  })

  test('ignores name, kit:pack and our own packages', ({ assert }) => {
    const ours = {
      ...base,
      name: 'a',
      scripts: { ...base.scripts, 'kit:pack': 'pack a' },
      devDependencies: { '@kevinjohn/adonisjs-account-kit': 'file:vendor/a.tgz' },
    }
    const theirs = {
      ...base,
      name: 'b',
      scripts: { ...base.scripts, 'kit:pack': 'pack b' },
      devDependencies: { '@kevinjohn/adonisjs-account-kit': 'file:vendor/b.tgz' },
    }
    const result = mergePackageJson(base, ours, theirs)
    assert.deepEqual(result.conflicts, [])
    assert.deepEqual(result.value, ours)
  })

  test('deletes a key one side removed and the other left alone', ({ assert }) => {
    const ours = { ...base, scripts: { test: 'node ace test' } }
    const result = mergePackageJson(base, ours, base)
    assert.deepEqual(result.value, { ...base, scripts: { test: 'node ace test' } })
  })

  test('conflicts when one side deletes a key the other edits', ({ assert }) => {
    const ours = { ...base, scripts: { test: 'node ace test' } }
    const theirs = { ...base, scripts: { ...base.scripts, lint: 'eslint . --fix' } }
    assert.deepEqual(mergePackageJson(base, ours, theirs).conflicts, ['scripts.lint'])
  })

  test('treats null and a missing key as different', ({ assert }) => {
    const ours = { ...base, main: null }
    const result = mergePackageJson(base, ours, base)
    assert.deepEqual(result.value, ours)
    const both = mergePackageJson(base, { ...base, main: null }, { ...base, main: 'index.js' })
    assert.deepEqual(both.conflicts, ['main'])
  })

  test('merges a file added on both sides from an empty base', ({ assert }) => {
    const result = mergePackageJson(MISSING, { name: 'a', x: 1 }, { name: 'a', y: 2 })
    assert.deepEqual(result.value, { name: 'a', x: 1, y: 2 })
  })
})
