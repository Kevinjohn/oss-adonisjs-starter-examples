import { test } from '@japa/runner'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { initRepository } from '../../src/git.ts'
import { commitFolder } from '../../src/tree_commit.ts'
import { kitFiles, temporaryDirectory, writeFiles } from '../helpers/fixture_repos.ts'

/** Commits the api fixture kit in a fresh repository and returns the commit id and repository. */
function commitKit(directory: string, name: string) {
  const folder = join(directory, `${name}-files`)
  writeFiles(folder, {
    ...kitFiles('api'),
    'tmp/kept.txt': 'matches tmp/* in .gitignore\n',
    'windows.txt': 'line one\r\nline two\r\n',
  })
  const git = initRepository(join(directory, name))
  const commit = commitFolder(git, folder, { parent: null, message: 'base', branch: 'base' })
  return { commit, git }
}

test.group('tree commits', (group) => {
  let directory: string
  const saved = { ...process.env }
  group.each.setup(() => {
    directory = temporaryDirectory()
    return () => {
      process.env = { ...saved }
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test('commits files the tree ignores and keeps the executable bit', ({ assert }) => {
    const { commit, git } = commitKit(directory, 'repo')
    const tree = git.text(['ls-tree', '-r', commit])
    assert.include(tree, '\ttmp/kept.txt')
    assert.match(tree, /^100755 blob \w+\tbin\/server\.ts$/m)
    assert.equal(git.text(['rev-parse', 'refs/heads/base']), commit)
  })

  test('gives identical commit ids under a hostile global git config', ({ assert }) => {
    const plain = commitKit(directory, 'plain').commit

    const hostile = join(directory, 'hostile.gitconfig')
    const hooks = join(directory, 'hooks')
    writeFiles(hooks, { 'pre-commit': { content: '#!/bin/sh\nexit 1\n', executable: true } })
    writeFileSync(join(directory, 'excludes'), '*.ts\n')
    writeFileSync(
      hostile,
      `[core]\n\tautocrlf = true\n\thooksPath = ${hooks}\n\texcludesFile = ${join(directory, 'excludes')}\n[user]\n\tname = Someone Else\n`
    )
    process.env.GIT_CONFIG_GLOBAL = hostile
    process.env.GIT_AUTHOR_DATE = '2020-02-02T00:00:00Z'

    assert.equal(commitKit(directory, 'hostile').commit, plain)
  })

  test('a global attributes file cannot merge a conflict away', ({ assert }) => {
    mkdirSync(join(directory, 'xdg/git'), { recursive: true })
    writeFileSync(join(directory, 'xdg/git/attributes'), '* merge=union\n')
    process.env.XDG_CONFIG_HOME = join(directory, 'xdg')
    const git = initRepository(join(directory, 'repo'))
    const commit = (content: string) => {
      writeFileSync(join(directory, 'repo/routes.ts'), content)
      git.run(['add', 'routes.ts'])
      git.run(['commit', '-q', '-m', content])
    }
    commit('base\n')
    git.run(['switch', '-q', '-c', 'theirs'])
    commit('theirs\n')
    git.run(['switch', '-q', 'main'])
    commit('ours\n')

    assert.notEqual(git.run(['merge', '-q', 'theirs'], { allowFailure: true }).code, 0)
  })
})
