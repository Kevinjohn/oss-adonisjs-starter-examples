import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { Git } from './git.ts'

/**
 * Commits every file in `folder` as a tree, with an optional parent, and points `refs/heads/<branch>`
 * at the commit. Files matching a `.gitignore` inside the folder are still committed. The
 * repository's own index and work tree are not touched.
 */
export function commitFolder(
  git: Git,
  folder: string,
  options: { parent: string | null; message: string; branch: string }
): string {
  const gitDirectory = git.text(['rev-parse', '--absolute-git-dir'])
  const index = join(gitDirectory, `index-${process.pid}-${Date.now()}`)
  const env = { GIT_DIR: gitDirectory, GIT_WORK_TREE: folder, GIT_INDEX_FILE: index }
  try {
    const inFolder = new Git(folder)
    inFolder.run(['add', '-A', '-f', '.'], { env })
    const tree = inFolder.text(['write-tree'], { env })
    const parentArgs = options.parent ? ['-p', options.parent] : []
    const commit = git.text(['commit-tree', tree, ...parentArgs, '-m', options.message])
    git.run(['update-ref', `refs/heads/${options.branch}`, commit])
    return commit
  } finally {
    rmSync(index, { force: true })
  }
}
