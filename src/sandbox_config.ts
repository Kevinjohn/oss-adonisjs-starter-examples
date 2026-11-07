import { readFileSync } from 'node:fs'
import { SandboxError } from './errors.ts'

export const SUPPORTED_KITS = ['api', 'hypermedia', 'inertia-react'] as const
export type Kit = (typeof SUPPORTED_KITS)[number]

export interface PackageConfig {
  name: string
  repository: string
  version: string
  buildsOn: string | null
  builtOn: { base: string; predecessorVersion: string | null }
  kits: Partial<Record<Kit, string>>
  exclude: string[]
}

export interface SandboxConfig {
  schemaVersion: 1
  base: { repository: string; commit: string }
  kits: Kit[]
  packages: PackageConfig[]
}

const COMMIT = /^[0-9a-f]{40}$/
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/
const REPOSITORY = /^Kevinjohn\/oss-adonisjs-[a-z-]+$/

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A relative path with no `..` segment, no leading `/` and no backslash.
 */
function isSafeRelativePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !value.includes('\\') &&
    value
      .replace(/\/$/, '')
      .split('/')
      .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  )
}

function fail(message: string): never {
  throw new SandboxError(message)
}

/**
 * Validates a parsed `config/sandbox.json` (specification 5.1) and returns it typed. Runs before
 * any fetch or write.
 */
export function validateSandboxConfig(value: unknown): SandboxConfig {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    fail(`Unsupported schemaVersion ${isRecord(value) ? value.schemaVersion : undefined}`)
  }

  const base = value.base
  const packages: unknown[] = Array.isArray(value.packages) ? value.packages : []
  const builtOnBases = packages.map((entry) => (isRecord(entry) ? entry.builtOn?.base : undefined))
  if (
    !isRecord(base) ||
    base.repository !== 'adonisjs/starter-kits' ||
    typeof base.commit !== 'string' ||
    !COMMIT.test(base.commit) ||
    !builtOnBases.every((commit) => typeof commit === 'string' && COMMIT.test(commit))
  ) {
    fail('Invalid base')
  }

  const kits = value.kits
  if (
    !Array.isArray(kits) ||
    kits.length === 0 ||
    new Set(kits).size !== kits.length ||
    !kits.every((kit) => (SUPPORTED_KITS as readonly unknown[]).includes(kit))
  ) {
    fail('Invalid kits')
  }

  if (packages.length === 0) fail('Invalid package name (no packages)')

  const seen = new Map<string, Record<string, any>>()
  for (const entry of packages) {
    const pkg = isRecord(entry) ? entry : {}
    const name = pkg.name
    if (typeof name !== 'string' || !name.startsWith('@kevinjohn/adonisjs-') || seen.has(name)) {
      fail(`Invalid package name ${name}`)
    }
    if (typeof pkg.repository !== 'string' || !REPOSITORY.test(pkg.repository)) {
      fail(`Invalid repository ${pkg.repository}`)
    }

    const predecessorVersion = pkg.builtOn.predecessorVersion
    for (const version of predecessorVersion === null
      ? [pkg.version]
      : [pkg.version, predecessorVersion]) {
      if (typeof version !== 'string' || !VERSION.test(version)) fail(`Invalid version ${version}`)
    }

    const buildsOn = pkg.buildsOn
    const predecessor = buildsOn === null ? undefined : seen.get(buildsOn)
    if (buildsOn !== null && !predecessor)
      fail(`${name} builds on ${buildsOn}, which must come earlier`)
    if ((buildsOn === null) !== (predecessorVersion === null)) {
      fail(`${name} builtOn does not match buildsOn`)
    }
    if (pkg.builtOn.base !== base.commit) {
      fail(
        `${name} examples were copied from base ${pkg.builtOn.base}; the sandbox uses ${base.commit}. Rebase them (16.1).`
      )
    }
    if (predecessor && predecessorVersion !== predecessor.version) {
      fail(
        `${name} examples were copied from ${buildsOn}@${predecessorVersion}; the sandbox uses ${buildsOn}@${predecessor.version}. Re-copy or rebase them (16.5).`
      )
    }

    if (!isRecord(pkg.kits)) fail(`Invalid kit path ${pkg.kits}`)
    for (const [kit, path] of Object.entries(pkg.kits)) {
      if (!kits.includes(kit) || !isSafeRelativePath(path)) fail(`Invalid kit path ${path}`)
      if (predecessor && !(kit in predecessor.kits))
        fail(`${name} has ${kit} but ${buildsOn} does not`)
    }

    if (!Array.isArray(pkg.exclude)) fail(`Invalid exclude ${pkg.exclude}`)
    for (const exclude of pkg.exclude) {
      if (!isSafeRelativePath(exclude)) fail(`Invalid exclude ${exclude}`)
    }

    seen.set(name, pkg)
  }

  return value as SandboxConfig
}

export function readSandboxConfig(path: string): SandboxConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new SandboxError(`Cannot read ${path}: ${(error as Error).message}`)
  }
  return validateSandboxConfig(parsed)
}

/**
 * The packages that have a folder for the kit, in config order.
 */
export function packagesForKit(config: SandboxConfig, kit: Kit): PackageConfig[] {
  return config.packages.filter((pkg) => pkg.kits[kit] !== undefined)
}
