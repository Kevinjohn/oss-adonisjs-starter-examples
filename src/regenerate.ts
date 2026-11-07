import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CommandRunner } from './command_runner.ts'
import { SandboxError } from './errors.ts'
import { listFiles } from './file_tree.ts'
import { type Git, extractArchive, initRepository } from './git.ts'
import { isRuntimePath } from './tree_filter.ts'

export interface OutputFile {
  path: string
  executable: boolean
  bytes: Buffer
}

export interface RegenerateOptions {
  /** The scratch repository and the commit to extract. */
  git: Git
  commit: string
  kit: string
  /** The folder `<T>`; it must not exist yet. */
  directory: string
  seedLockfile: Buffer | null
  /** Package archives to copy into `<T>/vendor/` before installing (6.8, main mode). */
  vendorArchives?: { source: string; fileName: string }[]
  frozenLockfile: boolean
  includeVendor: boolean
  runner: CommandRunner
  env: NodeJS.ProcessEnv
  log: (line: string) => void
}

export interface RegeneratedApp {
  files: OutputFile[]
}

/** `database/schema.ts` and `.adonisjs/`, which regeneration writes (specification 5.2). */
export function isGeneratedPath(path: string): boolean {
  return path === 'database/schema.ts' || path === '.adonisjs' || path.startsWith('.adonisjs/')
}

interface Snapshot {
  hash: string
  executable: boolean
}

function snapshotFile(path: string): Snapshot | null {
  if (!existsSync(path)) return null
  return {
    hash: createHash('sha256').update(readFileSync(path)).digest('hex'),
    executable: (statSync(path).mode & 0o111) !== 0,
  }
}

/**
 * Fails when the app has no `pnpm-workspace.yaml`: pnpm would then search upward and use the
 * sandbox's own workspace and lockfile.
 */
export function requireOwnWorkspace(app: string, kit: string): void {
  if (!existsSync(join(app, 'pnpm-workspace.yaml'))) {
    throw new SandboxError(
      `${kit} has no pnpm-workspace.yaml, so pnpm would use the sandbox's own workspace. Keep the starter kit's pnpm-workspace.yaml.`
    )
  }
}

/**
 * Specification 6.6: extracts the assembled app into `<T>`, installs it, runs the key, codegen and
 * migration commands, checks that only generated and runtime files changed, and returns the
 * output set.
 */
export async function regenerateApp(options: RegenerateOptions): Promise<RegeneratedApp> {
  const { directory: t, runner, env } = options
  mkdirSync(t, { recursive: true })
  extractArchive(options.git, options.commit, t)
  const appGit = initRepository(t)

  const sourcePaths = options.git
    .list(['ls-tree', '-r', '-z', '--name-only', options.commit])
    .filter((path) => !isGeneratedPath(path))
  const snapshot = new Map(sourcePaths.map((path) => [path, snapshotFile(join(t, path))]))
  const envExample = existsSync(join(t, '.env.example'))
    ? readFileSync(join(t, '.env.example'))
    : null

  requireOwnWorkspace(t, options.kit)
  if (options.seedLockfile) writeFileSync(join(t, 'pnpm-lock.yaml'), options.seedLockfile)
  for (const archive of options.vendorArchives ?? []) {
    mkdirSync(join(t, 'vendor'), { recursive: true })
    copyFileSync(archive.source, join(t, 'vendor', archive.fileName))
  }

  const commandOptions = { cwd: t, env }
  await runner.run(
    'pnpm',
    ['install', options.frozenLockfile ? '--frozen-lockfile' : '--no-frozen-lockfile'],
    commandOptions
  )
  copyFileSync(join(t, '.env.example'), join(t, '.env'))
  await runner.run('pnpm', ['exec', 'node', 'ace', 'generate:key', '--force'], commandOptions)
  await runner.run('pnpm', ['exec', 'node', 'ace', 'codegen'], commandOptions)
  await runner.run('pnpm', ['exec', 'node', 'ace', 'migration:run', '--force'], commandOptions)

  const envExamplePath = join(t, '.env.example')
  if (
    envExample &&
    (!existsSync(envExamplePath) || !readFileSync(envExamplePath).equals(envExample))
  ) {
    writeFileSync(join(t, '.env.example'), envExample)
    options.log(`restored .env.example (${options.kit})`)
  }

  const changed = sourcePaths.filter((path) => {
    const before = snapshot.get(path)!
    const after = snapshotFile(join(t, path))
    return !after || before?.hash !== after.hash || before.executable !== after.executable
  })
  const known = new Set(sourcePaths)
  const added = listFiles(t, {
    skipDirectory: (path) =>
      path.split('/').pop() === 'node_modules' || isRuntimePath(path) || isGeneratedPath(path),
  })
    .map((entry) => entry.path)
    .filter(
      (path) =>
        !known.has(path) &&
        path !== 'pnpm-lock.yaml' &&
        !isGeneratedPath(path) &&
        !isRuntimePath(path)
    )
  if (changed.length > 0 || added.length > 0) {
    throw new SandboxError(
      [
        `Regenerating ${options.kit} changed files that are not generated:`,
        ...changed.map((path) => `  changed ${path}`),
        ...added.map((path) => `  new ${path}`),
      ].join('\n')
    )
  }

  const ignoredPaths = (paths: string[]): Set<string> => {
    if (paths.length === 0) return new Set()
    const result = appGit.run(['check-ignore', '-z', '--stdin'], {
      input: paths.join('\0'),
      allowFailure: true,
    })
    if (result.code > 1) throw new Error(`git check-ignore failed in ${t}: ${result.stderr}`)
    return new Set(result.stdout.toString('utf8').split('\0').filter(Boolean))
  }

  const outputPaths = [...sourcePaths]
  if (existsSync(join(t, 'pnpm-lock.yaml'))) outputPaths.push('pnpm-lock.yaml')
  const generated = listFiles(t, {
    skipDirectory: (path) =>
      path !== '.adonisjs' && !path.startsWith('.adonisjs/') && path !== 'database',
  })
    .map((entry) => entry.path)
    .filter(isGeneratedPath)
  const ignored = ignoredPaths(generated)
  outputPaths.push(...generated.filter((path) => !ignored.has(path)))
  if (options.includeVendor && existsSync(join(t, 'vendor'))) {
    outputPaths.push(...listFiles(join(t, 'vendor')).map((entry) => `vendor/${entry.path}`))
  }

  const files = outputPaths.sort().map((path) => ({
    path,
    executable: (statSync(join(t, path)).mode & 0o111) !== 0,
    bytes: readFileSync(join(t, path)),
  }))
  return { files }
}
