import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { createWorkDirectory } from './assembly.ts'
import { SandboxError } from './errors.ts'
import { listFiles } from './file_tree.ts'
import { Git, extractArchive, initRepository } from './git.ts'
import { mergeLineage } from './merge.ts'
import { shortName } from './release_assets.ts'
import { ResolutionStore, resolvePendingConflicts } from './resolutions.ts'
import type { Kit, PackageConfig, SandboxConfig } from './sandbox_config.ts'
import { commitFolder } from './tree_commit.ts'
import {
  type RemoteUrlFor,
  RepositoryCache,
  localPackageSource,
  readBaseKit,
  taggedPackageSource,
} from './tree_source.ts'

/** Files the package owns outright: the predecessor's version never replaces them. */
const PACKAGE_OWNED = ['README.md', 'pnpm-lock.yaml']

export interface RebaseLayerOptions {
  /** The sandbox root. */
  root: string
  config: SandboxConfig
  packageName: string
  /** The package's working copy, whose example folders are rewritten. */
  packageRoot: string
  /** The new predecessor: a release of the package it builds on, or a base commit. */
  to: { predecessorVersion: string } | { base: string }
  remoteUrlFor: RemoteUrlFor
  log: (line: string) => void
}

/** Where a package's pending conflicts and saved resolutions live between runs. */
export function rebaseFolder(root: string, packageName: string): string {
  return join(root, 'tmp', 'rebase-layer', shortName(packageName))
}

function findPackage(config: SandboxConfig, name: string): PackageConfig {
  const pkg = config.packages.find((entry) => entry.name === name)
  if (!pkg) throw new SandboxError(`${name} is not in config/sandbox.json`)
  return pkg
}

/** The example folders' tracked and untracked files that git does not ignore. */
function exampleFiles(git: Git, folder: string): string[] {
  return git.list(['ls-files', '-co', '--exclude-standard', '-z', '--', folder])
}

function removeEmptyFolders(folder: string, stop: string): void {
  let current = folder
  while (current !== stop && current.startsWith(stop) && existsSync(current)) {
    if (readdirSync(current).length > 0) return
    rmdirSync(current)
    current = dirname(current)
  }
}

/**
 * Moves a package's examples onto a new predecessor for every kit in one operation (runbook 16.1,
 * specification 6.10). For each kit, the package's example is merged onto the new predecessor
 * with the old predecessor as the merge base. The package checkout changes only when every kit
 * merges: then each example folder is replaced exactly, deleting files the result does not have.
 * Conflicts stop the run and are written for editing; the next run saves the edited files and
 * uses them. Returns false when conflicts remain.
 */
export function rebaseLayer(options: RebaseLayerOptions): boolean {
  const { root, config, log } = options
  const pkg = findPackage(config, options.packageName)
  const short = shortName(pkg.name)
  const predecessor = pkg.buildsOn === null ? null : findPackage(config, pkg.buildsOn)
  if ((predecessor === null) !== 'base' in options.to) {
    throw new SandboxError(
      predecessor
        ? `${pkg.name} builds on ${predecessor.name}; pass --to <version>`
        : `${pkg.name} builds on the base; pass --base <commit>`
    )
  }
  const kits = Object.keys(pkg.kits) as Kit[]
  for (const kit of kits) {
    if (predecessor && !predecessor.kits[kit])
      throw new SandboxError(`${predecessor.name} has no ${kit} example`)
  }

  const packageGit = new Git(options.packageRoot)
  const dirty = packageGit.text([
    'status',
    '--porcelain',
    '--',
    ...kits.map((kit) => pkg.kits[kit]!),
  ])
  if (dirty !== '') {
    throw new SandboxError(
      `Commit or stash the changes in ${options.packageRoot} first, so the rebase can be undone:\n${dirty}`
    )
  }

  const folder = rebaseFolder(root, pkg.name)
  const pendingRoot = join(folder, 'conflicts')
  const resolutionsRoot = join(folder, 'resolutions')
  for (const kit of kits) {
    for (const path of resolvePendingConflicts({ pendingRoot, resolutionsRoot, kit, deletes: [] }))
      log(`saved ${relative(root, path)}`)
  }

  const cache = new RepositoryCache(join(root, 'tmp', 'cache', 'repos'), options.remoteUrlFor)
  const local = localPackageSource(options.packageRoot)
  const writePredecessor = (kit: Kit, destination: string, which: 'old' | 'new') => {
    if (predecessor) {
      const version =
        which === 'old'
          ? pkg.builtOn.predecessorVersion!
          : (options.to as { predecessorVersion: string }).predecessorVersion
      taggedPackageSource(cache, predecessor.repository, version).copyFolder(
        predecessor.kits[kit]!,
        destination
      )
    } else {
      const commit = which === 'old' ? pkg.builtOn.base : (options.to as { base: string }).base
      readBaseKit(cache, { repository: config.base.repository, commit }, kit, destination)
    }
  }

  const work = createWorkDirectory(root, `rebase-${short}`)
  try {
    const results = new Map<Kit, string>()
    const reports: string[] = []
    const notes: string[] = []
    for (const kit of kits) {
      const kitWork = join(work, kit)
      const tree = (name: string) => {
        const path = join(kitWork, 'trees', name)
        mkdirSync(path, { recursive: true })
        return path
      }
      const example = tree('example')
      local.copyFolder(pkg.kits[kit]!, example)
      const old = tree('old')
      const next = tree('new')
      writePredecessor(kit, old, 'old')
      writePredecessor(kit, next, 'new')
      for (const path of PACKAGE_OWNED) {
        const predecessorChanged =
          existsSync(join(old, path)) !== existsSync(join(next, path)) ||
          (existsSync(join(old, path)) &&
            !readFileSync(join(old, path)).equals(readFileSync(join(next, path))))
        if (path === 'pnpm-lock.yaml' && predecessorChanged)
          notes.push(`${kit}: the predecessor's lockfile changed; run pnpm install in the example`)
        for (const side of [old, next]) {
          rmSync(join(side, path), { force: true })
          if (existsSync(join(example, path))) copyFileSync(join(example, path), join(side, path))
        }
      }

      const git = initRepository(join(kitWork, 'repo'))
      const oldCommit = commitFolder(git, old, { parent: null, message: 'old', branch: 'old' })
      const exampleCommit = commitFolder(git, example, {
        parent: oldCommit,
        message: 'example',
        branch: 'example',
      })
      const newCommit = commitFolder(git, next, {
        parent: oldCommit,
        message: 'new',
        branch: 'new',
      })
      rmSync(join(pendingRoot, kit), { recursive: true, force: true })
      const outcome = mergeLineage({
        git,
        kit,
        lineage: {
          base: newCommit,
          entries: [{ pkg, label: `${short} example`, commit: exampleCommit, source: local }],
        },
        store: new ResolutionStore(resolutionsRoot, kit),
        pendingRoot,
        resolveCommand: 'pnpm rebase-layer',
        scratchDirectory: kitWork,
      })
      if (!outcome.ok) {
        // The merge report ends with the assembly's resolve instructions; this command has its own.
        reports.push(outcome.report.split('\n').slice(0, -3).join('\n'))
        continue
      }
      const result = tree('result')
      extractArchive(git, outcome.head, result)
      results.set(kit, result)
    }

    if (reports.length > 0) {
      for (const report of reports) log(report)
      log(
        [
          'Edit each file to the merged content and remove every conflict marker, then run the same',
          `pnpm rebase-layer command again. Nothing in ${options.packageRoot} changed.`,
        ].join('\n')
      )
      return false
    }

    for (const kit of kits) {
      const target = join(options.packageRoot, pkg.kits[kit]!)
      for (const file of exampleFiles(packageGit, pkg.kits[kit]!)) {
        rmSync(join(options.packageRoot, file), { force: true })
        removeEmptyFolders(dirname(join(options.packageRoot, file)), target)
      }
      const result = results.get(kit)!
      for (const entry of listFiles(result)) {
        const destination = join(target, entry.path)
        mkdirSync(dirname(destination), { recursive: true })
        copyFileSync(join(result, entry.path), destination)
      }
      log(`rebased ${pkg.kits[kit]}`)
    }
    for (const note of notes) log(note)
    rmSync(folder, { recursive: true, force: true })
    return true
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
