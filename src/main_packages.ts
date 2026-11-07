import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { readArchiveManifest } from './archive_manifest.ts'
import { type CommandRunner, constructedEnvironment } from './command_runner.ts'
import { SandboxError } from './errors.ts'
import { Git } from './git.ts'
import { unversionedAssetName } from './release_assets.ts'
import type { PackageConfig, SandboxConfig } from './sandbox_config.ts'
import type { RemoteUrlFor, RepositoryCache } from './tree_source.ts'

/** One package built from the commit its `main` pointed to at the start of the run. */
export interface MainPackage {
  pkg: PackageConfig
  commit: string
  /** Absolute path of the packed archive. */
  archive: string
  sha256: string
  /** Name, version and peers from the archive's own `package.json`. */
  manifest: Record<string, any>
}

/**
 * Resolves every package's `main` to one commit, then builds and packs each package once from that
 * commit (main mode, rule 1): a clone in `<work>/packages/<repo>`, a frozen install, `pnpm build`
 * and `pnpm pack` to an absolute path. Logs each commit and archive checksum.
 */
export async function buildMainPackages(options: {
  config: SandboxConfig
  cache: RepositoryCache
  remoteUrlFor: RemoteUrlFor
  work: string
  runner: CommandRunner
  log: (line: string) => void
}): Promise<MainPackage[]> {
  const commits = options.config.packages.map((pkg) => ({
    pkg,
    commit: options.cache.mainCommit(pkg.repository),
  }))
  const built: MainPackage[] = []
  for (const { pkg, commit } of commits) {
    const folder = join(options.work, 'packages', pkg.repository.replace('/', '__'))
    mkdirSync(join(options.work, 'packages'), { recursive: true })
    new Git(options.work).run(['clone', '-q', options.remoteUrlFor(pkg.repository), folder])
    new Git(folder).run(['checkout', '-q', '--detach', commit])

    const archive = join(options.work, 'archives', unversionedAssetName(pkg.name))
    mkdirSync(join(options.work, 'archives'), { recursive: true })
    const commandOptions = { cwd: folder, env: constructedEnvironment() }
    await options.runner.run('pnpm', ['install', '--frozen-lockfile'], commandOptions)
    await options.runner.run('pnpm', ['build'], commandOptions)
    await options.runner.run('pnpm', ['pack', '--out', archive], commandOptions)
    if (!existsSync(archive)) throw new SandboxError(`pnpm pack did not write ${archive}`)

    const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex')
    const manifest = readArchiveManifest(archive)
    if (manifest.name !== pkg.name) {
      throw new SandboxError(`${pkg.repository}@${commit} packs ${manifest.name}, not ${pkg.name}`)
    }
    options.log(`main ${pkg.name} ${commit} ${basename(archive)} sha256 ${sha256}`)
    built.push({ pkg, commit, archive, sha256, manifest })
  }
  return built
}
