import { test } from '@japa/runner'
import { rmSync } from 'node:fs'
import { kitWorkDirectory, mergeKit } from '../../src/assembly.ts'
import { exactly } from '../helpers/exact_message.ts'
import { ACCOUNT_KIT, MASQUERADE, SOFT_DELETE, SandboxFixture } from '../helpers/sandbox_fixture.ts'

function merge(fixture: SandboxFixture) {
  return mergeKit({
    root: fixture.root,
    config: fixture.config,
    kit: 'api',
    remoteUrlFor: fixture.world.remoteUrlFor,
  })
}

test.group('lineage', (group) => {
  let fixture: SandboxFixture
  group.each.setup(() => {
    fixture = new SandboxFixture()
    return () => fixture.cleanup()
  })

  function publishThree() {
    fixture.publish({
      name: ACCOUNT_KIT,
      version: '0.3.1',
      changes: () => ({ 'app/account.ts': 'ak\n' }),
    })
    fixture.publish({
      name: MASQUERADE,
      version: '0.2.1',
      buildsOn: ACCOUNT_KIT,
      changes: () => ({ 'app/masquerade.ts': 'm\n' }),
    })
    fixture.publish({
      name: SOFT_DELETE,
      version: '0.1.4',
      changes: () => ({ 'app/soft.ts': 's\n' }),
    })
  }

  test('commits each example on its predecessor', ({ assert }) => {
    publishThree()
    const { context, lineage, outcome } = merge(fixture)
    const [ak, m, s] = lineage.entries
    const mergeBase = (a: string, b: string) => context.git.text(['merge-base', a, b])

    assert.deepEqual(
      lineage.entries.map((entry) => entry.label),
      ['account-kit@0.3.1', 'masquerade@0.2.1', 'lucid-soft-delete@0.1.4']
    )
    assert.equal(context.git.text(['rev-parse', `${ak.commit}^`]), lineage.base)
    assert.equal(context.git.text(['rev-parse', `${m.commit}^`]), ak.commit)
    assert.equal(context.git.text(['rev-parse', `${s.commit}^`]), lineage.base)
    assert.equal(mergeBase(m.commit, s.commit), lineage.base)
    assert.equal(mergeBase(ak.commit, m.commit), ak.commit)
    assert.isTrue(outcome.ok)
    rmSync(kitWorkDirectory(fixture.root, 'api'), { recursive: true, force: true })
  })

  test('gives identical commit ids across runs', ({ assert }) => {
    publishThree()
    const first = merge(fixture)
    const second = merge(fixture)
    assert.deepEqual(
      second.lineage.entries.map((entry) => entry.commit),
      first.lineage.entries.map((entry) => entry.commit)
    )
    assert.equal(second.lineage.base, first.lineage.base)
    assert.deepEqual(second.outcome, first.outcome)
  })

  test('fails when a package peers on another predecessor version', ({ assert }) => {
    fixture.publish({ name: ACCOUNT_KIT, version: '0.3.1', changes: () => ({}) })
    fixture.publish({
      name: MASQUERADE,
      version: '0.2.1',
      buildsOn: ACCOUNT_KIT,
      peer: '^0.3.0',
      changes: () => ({}),
    })
    assert.throws(
      () => merge(fixture),
      exactly(
        `${MASQUERADE}@0.2.1 peers on ${ACCOUNT_KIT} ^0.3.0; the sandbox uses ${ACCOUNT_KIT}@0.3.1`
      )
    )
  })

  test('fails when the tag holds another package', ({ assert }) => {
    fixture.publish({
      name: ACCOUNT_KIT,
      version: '0.3.1',
      publishedName: '@kevinjohn/other',
      changes: () => ({}),
    })
    assert.throws(
      () => merge(fixture),
      exactly('Kevinjohn/oss-adonisjs-account-kit@v0.3.1 is @kevinjohn/other')
    )
  })

  test('fails when the kit path is not an AdonisJS app', ({ assert }) => {
    fixture.publish({
      name: ACCOUNT_KIT,
      version: '0.3.1',
      changes: () => ({ 'adonisrc.ts': null }),
    })
    assert.throws(
      () => merge(fixture),
      exactly(`${ACCOUNT_KIT} api path examples/api is not an AdonisJS app`)
    )
  })
})

test.group('migration order', (group) => {
  let fixture: SandboxFixture
  group.each.teardown(() => fixture.cleanup())

  test('passes a migration with a higher prefix', ({ assert }) => {
    fixture = new SandboxFixture()
    fixture.publish({
      name: ACCOUNT_KIT,
      version: '0.3.1',
      changes: () => ({ 'database/migrations/2000_create_tokens.ts': 'x\n' }),
    })
    assert.isTrue(merge(fixture).outcome.ok)
  })

  test('fails a migration that sorts before the predecessor', ({ assert }) => {
    fixture = new SandboxFixture()
    fixture.publish({
      name: ACCOUNT_KIT,
      version: '0.3.1',
      changes: () => ({ 'database/migrations/0999_create_tokens.ts': 'x\n' }),
    })
    assert.throws(
      () => merge(fixture),
      exactly(
        `${ACCOUNT_KIT} adds database/migrations/0999_create_tokens.ts (api), which sorts before database/migrations/1000_create_users_table.ts.\n` +
          'Rename it to a prefix above 1000 before it is first run (runbook 16.4).'
      )
    )
  })

  test('uses 0 when the predecessor has no migrations', ({ assert }) => {
    fixture = new SandboxFixture(['api'], () => ({
      'database/migrations/1000_create_users_table.ts': null,
    }))
    fixture.publish({
      name: ACCOUNT_KIT,
      version: '0.3.1',
      changes: () => ({ 'database/migrations/1_create_tokens.ts': 'x\n' }),
    })
    assert.isTrue(merge(fixture).outcome.ok)
  })

  test('passes equal prefixes from two packages on the same predecessor', ({ assert }) => {
    fixture = new SandboxFixture()
    fixture.publish({
      name: ACCOUNT_KIT,
      version: '0.3.1',
      changes: () => ({ 'database/migrations/2000_create_tokens.ts': 'x\n' }),
    })
    fixture.publish({
      name: SOFT_DELETE,
      version: '0.1.4',
      changes: () => ({ 'database/migrations/2000_add_deleted_at.ts': 'y\n' }),
    })
    assert.isTrue(merge(fixture).outcome.ok)
  })
})
