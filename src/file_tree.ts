import { chmodSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface FileEntry {
  /** Path relative to the listed folder, with `/` separators. */
  path: string
  kind: 'file' | 'symlink'
  executable: boolean
}

export interface ListOptions {
  /** Return true to leave a folder (given by its relative path) out of the listing. */
  skipDirectory?: (path: string) => boolean
}

/**
 * Every file and symlink under a folder, sorted by path. Folders are walked, not listed; `.git`
 * folders are skipped.
 */
export function listFiles(root: string, options: ListOptions = {}): FileEntry[] {
  const entries: FileEntry[] = []
  const walk = (relative: string) => {
    for (const name of readdirSync(join(root, relative))) {
      const path = relative === '' ? name : `${relative}/${name}`
      const stats = lstatSync(join(root, path))
      if (stats.isDirectory()) {
        if (name === '.git' || options.skipDirectory?.(path)) continue
        walk(path)
      } else if (stats.isSymbolicLink()) {
        entries.push({ path, kind: 'symlink', executable: false })
      } else {
        entries.push({ path, kind: 'file', executable: (stats.mode & 0o111) !== 0 })
      }
    }
  }
  walk('')
  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/**
 * Writes a file, creating its folders, with mode 0755 or 0644.
 */
export function writeFileWithMode(path: string, bytes: Buffer, executable: boolean): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, bytes)
  chmodSync(path, executable ? 0o755 : 0o644)
}
