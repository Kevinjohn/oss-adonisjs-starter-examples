import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listFiles } from './file_tree.ts'
import type { OutputFile } from './regenerate.ts'
import { isRuntimePath } from './tree_filter.ts'

export interface Difference {
  path: string
  kind: 'added' | 'removed' | 'changed'
}

/**
 * Specification 6.6, check: compares the output set with a committed app folder by path, mode and
 * bytes. `added` means the output has a file the folder lacks. Files in the folder that the app
 * ignores, or that are runtime files, are not differences.
 */
export function compareOutput(output: OutputFile[], directory: string): Difference[] {
  const differences: Difference[] = []
  const expected = new Set(output.map((file) => file.path))

  for (const file of output) {
    const path = join(directory, file.path)
    if (!existsSync(path)) {
      differences.push({ path: file.path, kind: 'added' })
      continue
    }
    const stats = lstatSync(path)
    const executable = (stats.mode & 0o111) !== 0
    if (
      !stats.isFile() ||
      executable !== file.executable ||
      !readFileSync(path).equals(file.bytes)
    ) {
      differences.push({ path: file.path, kind: 'changed' })
    }
  }

  if (existsSync(directory)) {
    const extra = listFiles(directory, {
      skipDirectory: (path) => path.split('/').pop() === 'node_modules',
    })
      .map((entry) => entry.path)
      .filter((path) => !expected.has(path) && !isRuntimePath(path))
    for (const path of extra) differences.push({ path, kind: 'removed' })
  }

  return differences.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
