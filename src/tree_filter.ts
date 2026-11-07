import { lstatSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { SandboxError } from './errors.ts'
import { listFiles } from './file_tree.ts'

/**
 * True for the runtime files of specification 5.2: `.env`, anything in `tmp/` except
 * `tmp/.gitkeep`, and anything in `node_modules/`, `build/` or `vendor/`.
 */
export function isRuntimePath(path: string): boolean {
  const [first] = path.split('/')
  if (path === '.env') return true
  if (first === 'tmp') return path !== 'tmp/.gitkeep'
  return first === 'node_modules' || first === 'build' || first === 'vendor'
}

/**
 * Prepares a raw example or base tree for committing (specification 6.2): removes the lockfile,
 * the root README and the package's excludes, then fails on runtime files and symlinks.
 * `source` names the tree in messages.
 */
export function filterTree(directory: string, source: string, exclude: string[] = []): void {
  for (const path of ['pnpm-lock.yaml', 'README.md', ...exclude]) {
    const target = join(directory, path.replace(/\/$/, ''))
    // A trailing `/` excludes a directory only (specification 5.1).
    if (path.endsWith('/') && !lstatSync(target, { throwIfNoEntry: false })?.isDirectory()) continue
    rmSync(target, { recursive: true, force: true })
  }
  for (const entry of listFiles(directory)) {
    if (entry.kind === 'symlink') {
      throw new SandboxError(`Symlinks are not supported: ${entry.path} in ${source}`)
    }
    if (isRuntimePath(entry.path) || entry.path.split('/').includes('node_modules')) {
      throw new SandboxError(`Unexpected ${entry.path} in ${source}`)
    }
  }
}
