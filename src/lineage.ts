import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { SandboxError } from './errors.ts'
import { type Git } from './git.ts'
import { checkMigrationOrder } from './migration_order.ts'
import {
  type Kit,
  type PackageConfig,
  type SandboxConfig,
  packagesForKit,
} from './sandbox_config.ts'
import { commitFolder } from './tree_commit.ts'
import { filterTree } from './tree_filter.ts'
import type { PackageSource } from './tree_source.ts'

export interface LineageEntry {
  pkg: PackageConfig
  label: string
  commit: string
  source: PackageSource
}

export interface Lineage {
  base: string
  entries: LineageEntry[]
}

export interface LineageOptions {
  git: Git
  /** Scratch folder for extracted trees. */
  workDirectory: string
  config: SandboxConfig
  kit: Kit
  /** Writes the base kit's files into an empty folder. */
  readBase: (destination: string) => void
  sourceFor: (pkg: PackageConfig) => PackageSource
  labelFor: (pkg: PackageConfig) => string
}

function readManifest(source: PackageSource): Record<string, any> {
  const bytes = source.readFile('package.json')
  if (!bytes) throw new SandboxError(`${source.description} has no package.json`)
  return JSON.parse(bytes.toString('utf8'))
}

/**
 * Checks the fetched package against the config (specification 5.1 and 6.3 lineage step 3.1).
 */
function checkManifest(config: SandboxConfig, pkg: PackageConfig, source: PackageSource): void {
  const manifest = readManifest(source)
  if (manifest.name !== pkg.name)
    throw new SandboxError(`${source.description} is ${manifest.name}`)
  if (pkg.buildsOn === null) return
  const predecessor = config.packages.find((entry) => entry.name === pkg.buildsOn)!
  const range = manifest.peerDependencies?.[pkg.buildsOn]
  if (range !== predecessor.version) {
    throw new SandboxError(
      `${pkg.name}@${manifest.version} peers on ${pkg.buildsOn} ${range}; the sandbox uses ${pkg.buildsOn}@${predecessor.version}`
    )
  }
}

/**
 * Commits the base and every package example for one kit, each on its predecessor
 * (specification 6.3, lineage).
 */
export function buildLineage(options: LineageOptions): Lineage {
  const { git, config, kit } = options
  const freshFolder = (name: string) => {
    const folder = join(options.workDirectory, name)
    rmSync(folder, { recursive: true, force: true })
    mkdirSync(folder, { recursive: true })
    return folder
  }

  const baseFolder = freshFolder('base')
  options.readBase(baseFolder)
  filterTree(baseFolder, `${config.base.repository}@${config.base.commit}:${kit}`)
  const base = commitFolder(git, baseFolder, { parent: null, message: 'base', branch: 'base' })

  const entries: LineageEntry[] = []
  for (const pkg of packagesForKit(config, kit)) {
    const label = options.labelFor(pkg)
    const source = options.sourceFor(pkg)
    checkManifest(config, pkg, source)

    const kitPath = pkg.kits[kit]!
    const folder = freshFolder(label)
    if (!source.hasFolder(kitPath)) {
      throw new SandboxError(`${pkg.name} ${kit} path ${kitPath} is not an AdonisJS app`)
    }
    source.copyFolder(kitPath, folder)
    if (!existsSync(join(folder, 'package.json')) || !existsSync(join(folder, 'adonisrc.ts'))) {
      throw new SandboxError(`${pkg.name} ${kit} path ${kitPath} is not an AdonisJS app`)
    }
    filterTree(folder, `${source.description} ${kitPath}`, pkg.exclude)

    const parent =
      pkg.buildsOn === null
        ? base
        : entries.find((entry) => entry.pkg.name === pkg.buildsOn)!.commit
    const commit = commitFolder(git, folder, { parent, message: label, branch: label })
    checkMigrationOrder(git, { packageName: pkg.name, kit, parent, commit })
    entries.push({ pkg, label, commit, source })
  }
  return { base, entries }
}
