import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { shortName } from '../../src/release_assets.ts'
import type { Kit, PackageConfig, SandboxConfig } from '../../src/sandbox_config.ts'
import { type FileSpec, FixtureWorld, kitFiles } from './fixture_repos.ts'

export interface FixturePackage {
  name: string
  version: string
  buildsOn?: string
  /** Defaults to the sandbox version of `buildsOn`. */
  peer?: string
  /** Name in the published root `package.json`; defaults to `name`. */
  publishedName?: string
  /** Changes on top of the predecessor's example, per kit. */
  changes: (kit: Kit) => FileSpec
}

export const ACCOUNT_KIT = '@kevinjohn/adonisjs-account-kit'
export const MASQUERADE = '@kevinjohn/adonisjs-masquerade'
export const SOFT_DELETE = '@kevinjohn/adonisjs-lucid-soft-delete'

/**
 * A sandbox root plus local stand-ins for the starter kits and our package repositories. Each
 * package's example is its predecessor's example plus `changes`, published at `v<version>`.
 */
export class SandboxFixture {
  readonly world = new FixtureWorld()
  readonly root = this.world.sandboxRoot
  baseCommit = ''
  config!: SandboxConfig
  private examples = new Map<string, Map<Kit, FileSpec>>()

  constructor(
    readonly kits: Kit[] = ['api'],
    baseChanges: (kit: Kit) => FileSpec = () => ({})
  ) {
    mkdirSync(join(this.root, 'templates'), { recursive: true })
    copyFileSync(
      join(import.meta.dirname, '../../templates/app_readme.md'),
      join(this.root, 'templates/app_readme.md')
    )
    this.baseCommit = this.world.publishBase(
      Object.fromEntries(kits.map((kit) => [kit, { ...kitFiles(kit), ...baseChanges(kit) }]))
    )
    this.config = {
      schemaVersion: 1,
      base: { repository: 'adonisjs/starter-kits', commit: this.baseCommit },
      kits,
      packages: [],
    }
  }

  repositoryOf(name: string): string {
    return `Kevinjohn/oss-adonisjs-${shortName(name)}`
  }

  /** Publishes a release and adds or updates the package in the config. */
  publish(pkg: FixturePackage): void {
    const predecessor = pkg.buildsOn ? this.examples.get(pkg.buildsOn)! : undefined
    const predecessorConfig = this.config.packages.find((entry) => entry.name === pkg.buildsOn)
    const examples = new Map<Kit, FileSpec>()
    for (const kit of this.kits) {
      const start = predecessor ? predecessor.get(kit)! : kitFiles(kit)
      examples.set(kit, { ...start, ...pkg.changes(kit) })
    }
    this.examples.set(pkg.name, examples)

    this.world.publishPackage({
      name: pkg.publishedName ?? pkg.name,
      repository: this.repositoryOf(pkg.name),
      version: pkg.version,
      peerDependencies: pkg.buildsOn
        ? { [pkg.buildsOn]: pkg.peer ?? predecessorConfig!.version }
        : {},
      examples: Object.fromEntries(
        this.kits.map((kit) => [kit, { path: `examples/${kit}`, files: examples.get(kit)! }])
      ),
    })

    const entry: PackageConfig = {
      name: pkg.name,
      repository: this.repositoryOf(pkg.name),
      version: pkg.version,
      buildsOn: pkg.buildsOn ?? null,
      builtOn: { base: this.baseCommit, predecessorVersion: predecessorConfig?.version ?? null },
      kits: Object.fromEntries(this.kits.map((kit) => [kit, `examples/${kit}`])),
      exclude: [],
    }
    const index = this.config.packages.findIndex((existing) => existing.name === pkg.name)
    if (index === -1) this.config.packages.push(entry)
    else this.config.packages[index] = entry
  }

  cleanup(): void {
    this.world.cleanup()
  }
}
