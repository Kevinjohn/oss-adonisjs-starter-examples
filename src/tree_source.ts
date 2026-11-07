import {
  copyFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { Git, extractArchive, initRepository } from './git.ts'

/** Maps a GitHub repository such as `adonisjs/starter-kits` to the URL to fetch it from. */
export type RemoteUrlFor = (repository: string) => string

export const githubUrlFor: RemoteUrlFor = (repository) => `https://github.com/${repository}.git`

/**
 * Shallow bare clones under `tmp/cache/repos`, one per repository (specification 6.2).
 */
export class RepositoryCache {
  constructor(
    readonly directory: string,
    readonly remoteUrlFor: RemoteUrlFor
  ) {}

  repository(repository: string): Git {
    const path = join(this.directory, `${repository.replace('/', '__')}.git`)
    if (!existsSync(join(path, 'HEAD'))) {
      const git = initRepository(path, { bare: true })
      git.run(['remote', 'add', 'origin', this.remoteUrlFor(repository)])
      return git
    }
    const git = new Git(path)
    git.run(['remote', 'set-url', 'origin', this.remoteUrlFor(repository)])
    return git
  }

  /** The bare clone with the commit present. */
  withCommit(repository: string, commit: string): Git {
    const git = this.repository(repository)
    if (!git.succeeds(['cat-file', '-e', `${commit}^{commit}`])) {
      git.run(['fetch', '-q', '--depth=1', 'origin', `${commit}:refs/pins/${commit}`])
    }
    return git
  }

  /** The bare clone with the tag `v<version>` present. */
  withTag(repository: string, version: string): Git {
    const git = this.repository(repository)
    const tag = `refs/tags/v${version}`
    if (!git.succeeds(['rev-parse', '-q', '--verify', tag])) {
      git.run(['fetch', '-q', '--depth=1', 'origin', `${tag}:${tag}`])
    }
    return git
  }
}

/**
 * Reads files from a package: at its release tag, or from a local working copy.
 */
export interface PackageSource {
  /** Names the source in messages, such as `Kevinjohn/oss-adonisjs-account-kit@v0.3.1`. */
  readonly description: string
  /** A file relative to the repository root, or null when it does not exist. */
  readFile(path: string): Buffer | null
  /** Copies a folder's files into an empty folder. Symlinks stay symlinks. */
  copyFolder(path: string, destination: string): void
  /** True when the folder exists in the source. */
  hasFolder(path: string): boolean
}

export function readBaseKit(
  cache: RepositoryCache,
  base: { repository: string; commit: string },
  kit: string,
  destination: string
): void {
  const git = cache.withCommit(base.repository, base.commit)
  extractArchive(git, `${base.commit}:${kit}`, destination)
}

export function taggedPackageSource(
  cache: RepositoryCache,
  repository: string,
  version: string
): PackageSource {
  const git = cache.withTag(repository, version)
  const tag = `v${version}`
  return {
    description: `${repository}@${tag}`,
    readFile(path) {
      if (!git.succeeds(['cat-file', '-e', `${tag}:${path}`])) return null
      return git.run(['show', `${tag}:${path}`]).stdout
    },
    copyFolder(path, destination) {
      extractArchive(git, `${tag}:${path}`, destination)
    },
    hasFolder(path) {
      return git.text(['cat-file', '-t', `${tag}:${path}`], { allowFailure: true }) === 'tree'
    },
  }
}

/**
 * A package's working copy, including uncommitted files that git does not ignore (6.2).
 */
export function localPackageSource(root: string): PackageSource {
  const git = new Git(root)
  return {
    description: `local ${root}`,
    readFile(path) {
      const file = join(root, path)
      return existsSync(file) ? readFileSync(file) : null
    },
    copyFolder(path, destination) {
      const files = git.list(['ls-files', '-co', '--exclude-standard', '-z', '--', path])
      for (const file of files) {
        const source = join(root, file)
        let stats
        try {
          stats = lstatSync(source)
        } catch {
          continue
        }
        const target = join(destination, file.slice(path.replace(/\/$/, '').length + 1))
        mkdirSync(dirname(target), { recursive: true })
        if (stats.isSymbolicLink()) {
          symlinkSync(readlinkSync(source), target)
        } else if (stats.isFile()) {
          copyFileSync(source, target)
          chmodSync(target, stats.mode & 0o111 ? 0o755 : 0o644)
        }
      }
    },
    hasFolder(path) {
      return existsSync(join(root, path)) && lstatSync(join(root, path)).isDirectory()
    },
  }
}
