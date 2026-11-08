import { test } from '@japa/runner'
import { resolveRegistryConflict } from '../../src/registry_merge.ts'

/** A diff3 conflict hunk between two plain runs. */
function conflict(ours: string[], base: string[], theirs: string[]): Buffer {
  return Buffer.from(
    [
      'export default defineConfig({',
      '  providers: [',
      '<<<<<<< ours',
      ...ours,
      '||||||| base',
      ...base,
      '=======',
      ...theirs,
      '>>>>>>> theirs',
      '  ],',
      '})',
      '',
    ].join('\n')
  )
}

const resolved = (path: string, bytes: Buffer) =>
  resolveRegistryConflict(path, bytes)?.toString('utf8') ?? null

test.group('registry conflicts', () => {
  test('keeps both sides when each only added lines after the same base line', ({ assert }) => {
    const base = ["    () => import('@adonisjs/auth/auth_provider'),"]
    const merged = resolved(
      'adonisrc.ts',
      conflict([...base, "    () => import('#providers/masquerade_provider'),"], base, [
        ...base,
        "    () => import('@kevinjohn/adonisjs-lucid-soft-delete/provider'),",
      ])
    )
    assert.equal(
      merged,
      [
        'export default defineConfig({',
        '  providers: [',
        "    () => import('@adonisjs/auth/auth_provider'),",
        "    () => import('#providers/masquerade_provider'),",
        "    () => import('@kevinjohn/adonisjs-lucid-soft-delete/provider'),",
        '  ],',
        '})',
        '',
      ].join('\n')
    )
  })

  test('keeps both sides when each only added lines before the same base line', ({ assert }) => {
    const merged = resolved(
      'start/kernel.ts',
      conflict(['    a,', '    end,'], ['    end,'], ['    b,', '    end,'])
    )
    assert.include(merged!, '    a,\n    b,\n    end,\n')
  })

  test('adds the same lines once', ({ assert }) => {
    const merged = resolved('adonisrc.ts', conflict(['    a,'], [], ['    a,']))
    assert.include(merged!, '  providers: [\n    a,\n  ],')
  })

  test('leaves a conflict to a person when a side changed a base line', ({ assert }) => {
    assert.isNull(
      resolved(
        'start/env.ts',
        conflict(['  A: one,', '  B: two,'], ['  A: zero,'], ['  A: zero,', '  C: three,'])
      )
    )
  })

  test('leaves a conflict to a person when both added an overlapping entry', ({ assert }) => {
    assert.isNull(resolved('adonisrc.ts', conflict(['    a,', '    b,'], [], ['    a,', '    c,'])))
  })

  test('leaves a conflict to a person when the result does not parse', ({ assert }) => {
    assert.isNull(resolved('adonisrc.ts', conflict(['    a: (,'], [], ['    b,'])))
  })

  test('leaves files other than registry files to a person', ({ assert }) => {
    assert.isNull(resolved('start/routes.ts', conflict(['    a,'], [], ['    b,'])))
  })

  test('accepts env files with one assignment per key, and refuses a duplicate key', ({
    assert,
  }) => {
    const env = (ours: string, theirs: string) =>
      Buffer.from(
        `HOST=localhost\n<<<<<<< ours\n${ours}\n||||||| base\n=======\n${theirs}\n>>>>>>> theirs\n`
      )
    assert.equal(
      resolved('.env.example', env('# A\nA=1', 'B=2')),
      'HOST=localhost\n# A\nA=1\nB=2\n'
    )
    assert.isNull(resolved('.env.example', env('A=1', 'A=2')))
  })
})
