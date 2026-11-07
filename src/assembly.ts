import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { type CommandRunner, constructedEnvironment } from './command_runner.ts'
import { compareOutput } from './compare.ts'
import { SandboxError } from './errors.ts'
import { writeFileWithMode } from './file_tree.ts'
import { type Git, initRepository } from './git.ts'
import { type Lineage, buildLineage } from './lineage.ts'
import { mergeLineage } from './merge.ts'
import { normaliseApp, renderAppReadme } from './normalise.ts'
import { regenerateApp } from './regenerate.ts'
import { releaseAssetUrl, shortName, unversionedAssetName } from './release_assets.ts'
import { ResolutionStore } from './resolutions.ts'
import type { Kit, PackageConfig, SandboxConfig } from './sandbox_config.ts'
import {
  type PackageSource,
  type RemoteUrlFor,
  RepositoryCache,
  localPackageSource,
  readBaseKit,
  taggedPackageSource,
} from './tree_source.ts'

export interface LocalPackage {
  /** Absolute path of the package's working copy. */
  root: string
  /** Absolute output folder inside the sandbox's `tmp/`. */
  out: string
}

export interface AssemblyOptions {
  /** The sandbox repository root. */
  root: string
  config: SandboxConfig
  kits: Kit[]
  mode: 'assemble' | 'check'
  local?: LocalPackage
  remoteUrlFor: RemoteUrlFor
  runner: CommandRunner
  log: (line: string) => void
}

/**
 * Resolves a folder option (`--out`, `--pending`) and refuses anything that is not a folder inside
 * the sandbox's `tmp/` after following symlinks (specification 6.8).
 */
export function resolveOutDirectory(root: string, out: string, option = '--out'): string {
  mkdirSync(join(root, 'tmp'), { recursive: true })
  const tmp = realpathSync(join(root, 'tmp'))
  let existing = resolve(out)
  const rest: string[] = []
  while (!existsSync(existing)) {
    rest.unshift(basename(existing))
    existing = dirname(existing)
  }
  const real = join(realpathSync(existing), ...rest)
  if (!real.startsWith(tmp + sep)) {
    throw new SandboxError(`${option} must be a folder inside ${join(root, 'tmp')}, not ${out}`)
  }
  return real
}

interface KitContext {
  kit: Kit
  work: string
  git: Git
  pendingRoot: string
  store: ResolutionStore
}

/**
 * A new scratch folder under `tmp/work/` for one run, so concurrent runs never share one. The
 * caller deletes it.
 */
export function createWorkDirectory(root: string, name: string): string {
  mkdirSync(join(root, 'tmp', 'work'), { recursive: true })
  return mkdtempSync(join(root, 'tmp', 'work', `${name}-`))
}

function labelFor(pkg: PackageConfig, localName: string | undefined): string {
  return `${shortName(pkg.name)}@${pkg.name === localName ? 'local' : pkg.version}`
}

/**
 * Builds the lineage and merges it for one kit. Shared by assembly and `pnpm resolve
 * --prune-unused`. `work` is an empty scratch folder the caller deletes.
 */
export function mergeKit(options: {
  root: string
  config: SandboxConfig
  kit: Kit
  work: string
  remoteUrlFor: RemoteUrlFor
  local?: { root: string; name: string; pendingRoot: string }
}): { context: KitContext; lineage: Lineage; outcome: ReturnType<typeof mergeLineage> } {
  const { root, config, kit, work } = options
  const git = initRepository(join(work, 'repo'))
  const pendingRoot = options.local?.pendingRoot ?? join(root, 'tmp', 'conflicts')
  const resolveCommand = options.local
    ? `pnpm resolve --kit ${kit} --pending ${relative(root, pendingRoot)}`
    : `pnpm resolve --kit ${kit}`
  rmSync(join(pendingRoot, kit), { recursive: true, force: true })

  const cache = new RepositoryCache(join(root, 'tmp', 'cache', 'repos'), options.remoteUrlFor)
  const sources = new Map<string, PackageSource>()
  const sourceFor = (pkg: PackageConfig): PackageSource => {
    if (!sources.has(pkg.name)) {
      sources.set(
        pkg.name,
        pkg.name === options.local?.name
          ? localPackageSource(options.local.root)
          : taggedPackageSource(cache, pkg.repository, pkg.version)
      )
    }
    return sources.get(pkg.name)!
  }

  const lineage = buildLineage({
    git,
    workDirectory: join(work, 'trees'),
    config,
    kit,
    readBase: (destination) => readBaseKit(cache, config.base, kit, destination),
    sourceFor,
    labelFor: (pkg) => labelFor(pkg, options.local?.name),
  })
  const store = new ResolutionStore(join(root, 'resolutions'), kit)
  const outcome = mergeLineage({
    git,
    kit,
    lineage,
    store,
    pendingRoot,
    resolveCommand,
    scratchDirectory: work,
  })
  return { context: { kit, work, git, pendingRoot, store }, lineage, outcome }
}

/**
 * Packs the local package once per run: `pnpm --dir <root> build`, then `pnpm pack` into the
 * sandbox's `tmp/` (specification 6.8). Returns the archive path.
 */
async function packLocalPackage(options: AssemblyOptions, name: string): Promise<string> {
  const local = options.local!
  const folder = createWorkDirectory(options.root, 'local-pack')
  const archive = join(folder, unversionedAssetName(name))
  const commandOptions = { cwd: local.root, env: constructedEnvironment() }
  options.log(`packing ${name} from ${local.root}`)
  try {
    await options.runner.run('pnpm', ['--dir', local.root, 'build'], commandOptions)
    await options.runner.run(
      'pnpm',
      ['--dir', local.root, 'pack', '--out', archive],
      commandOptions
    )
    if (!existsSync(archive)) throw new SandboxError(`pnpm pack did not write ${archive}`)
    return archive
  } catch (error) {
    rmSync(folder, { recursive: true, force: true })
    throw error
  }
}

async function assembleKit(
  options: AssemblyOptions,
  kit: Kit,
  local: { name: string; archive: string } | undefined
): Promise<boolean> {
  const { root, config, log } = options
  const work = createWorkDirectory(root, kit)
  try {
    const { context, lineage, outcome } = mergeKit({
      root,
      config,
      kit,
      work,
      remoteUrlFor: options.remoteUrlFor,
      local:
        local && options.local
          ? {
              root: options.local.root,
              name: local.name,
              pendingRoot: join(options.local.out, 'conflicts'),
            }
          : undefined,
    })
    if (!outcome.ok) {
      log(outcome.report)
      return false
    }

    const { git } = context
    const specifiers = new Map<string, string>()
    for (const entry of lineage.entries) {
      specifiers.set(
        entry.pkg.name,
        entry.pkg.name === local?.name
          ? `file:vendor/${unversionedAssetName(entry.pkg.name)}`
          : releaseAssetUrl(entry.pkg.repository, entry.pkg.name, entry.pkg.version)
      )
    }
    const template = readFileSync(join(root, 'templates', 'app_readme.md'), 'utf8')
    normaliseApp({
      appDirectory: git.cwd,
      kit,
      specifiers,
      overlay: join(root, 'layers', 'combined', kit),
      readme: renderAppReadme(template, {
        kit,
        baseCommit: config.base.commit,
        packages: lineage.entries.map((entry) => ({
          name: entry.pkg.name,
          version: entry.pkg.name === local?.name ? 'local' : entry.pkg.version,
          url: `https://github.com/${entry.pkg.repository}/tree/v${entry.pkg.version}/${entry.pkg.kits[kit]}`,
        })),
      }),
    })
    git.run(['add', '-A', '-f'])
    git.run(['commit', '-q', '--allow-empty', '-m', 'normalise'])

    let ok = true
    for (const key of context.store.unused()) {
      const path = relative(root, join(context.store.folder, key))
      if (options.mode === 'check') {
        log(`Unused resolution ${path}`)
        ok = false
      } else {
        log(`warning: unused resolution ${path} (run pnpm resolve --kit ${kit} --prune-unused)`)
      }
    }

    const appsLockfile = join(root, 'apps', kit, 'pnpm-lock.yaml')
    const last = lineage.entries.at(-1)
    const seedLockfile = existsSync(appsLockfile)
      ? readFileSync(appsLockfile)
      : (last?.source.readFile(`${last.pkg.kits[kit]}/pnpm-lock.yaml`) ?? null)

    const regenerated = await regenerateApp({
      git,
      commit: 'app',
      kit,
      directory: join(context.work, 'app'),
      seedLockfile,
      vendorArchive: local
        ? { source: local.archive, fileName: unversionedAssetName(local.name) }
        : undefined,
      frozenLockfile: options.mode === 'check',
      includeVendor: local !== undefined,
      runner: options.runner,
      env: constructedEnvironment(),
      log,
    })

    if (options.mode === 'check') {
      const differences = compareOutput(regenerated.files, join(root, 'apps', kit))
      for (const difference of differences) log(`${difference.kind} apps/${kit}/${difference.path}`)
      if (differences.length > 0) {
        log(`apps/${kit} differs from the assembled app; run pnpm assemble --kit ${kit}`)
        ok = false
      }
      return ok
    }

    const target = options.local ? join(options.local.out, kit) : join(root, 'apps', kit)
    rmSync(target, { recursive: true, force: true })
    for (const file of regenerated.files)
      writeFileWithMode(join(target, file.path), file.bytes, file.executable)
    log(`assembled ${relative(root, target) || target}`)
    return ok
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/**
 * `pnpm assemble`: assembles, checks or builds with a local package, one kit at a time. Returns
 * false when any kit failed; every kit is attempted.
 */
export async function runAssembly(options: AssemblyOptions): Promise<boolean> {
  let local: { name: string; archive: string } | undefined
  if (options.local) {
    const manifest = JSON.parse(readFileSync(join(options.local.root, 'package.json'), 'utf8'))
    if (!options.config.packages.some((pkg) => pkg.name === manifest.name)) {
      throw new SandboxError(`Add ${manifest.name} to config/sandbox.json in the sandbox first`)
    }
    local = { name: manifest.name, archive: await packLocalPackage(options, manifest.name) }
  }

  try {
    let ok = true
    for (const kit of options.kits) {
      try {
        if (!(await assembleKit(options, kit, local))) ok = false
      } catch (error) {
        if (!(error instanceof SandboxError)) throw error
        options.log(`${kit}: ${error.message}`)
        ok = false
      }
    }
    return ok
  } finally {
    if (local) rmSync(dirname(local.archive), { recursive: true, force: true })
  }
}
