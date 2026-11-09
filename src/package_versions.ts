import { SandboxError } from './errors.ts'
import type { PackageConfig } from './sandbox_config.ts'

/** A package release to record in `config/sandbox.json`. */
export interface VersionUpdate {
  name: string
  version: string
  /** The `buildsOn` package's exact peer in the released `package.json`; `null` when none. */
  predecessorVersion: string | null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replaces the first `"key": "..."` after the package's `"name"` line and before the next package.
 * Returns `undefined` when the package or key is absent.
 */
function replaceField(text: string, name: string, key: string, value: string): string | undefined {
  const start = text.indexOf(`"name": "${name}"`)
  if (start === -1) return undefined
  const next = text.indexOf('"name": "', start + 1)
  const end = next === -1 ? text.length : next
  const block = text.slice(start, end)
  const pattern = new RegExp(`"${escapeRegExp(key)}": (?:"[^"]*"|null)`)
  if (!pattern.test(block)) return undefined
  return text.slice(0, start) + block.replace(pattern, `"${key}": "${value}"`) + text.slice(end)
}

/** Sets each package's `version` and, where it builds on another, `builtOn.predecessorVersion`. */
export function setConfigVersions(text: string, updates: VersionUpdate[]): string {
  let result = text
  for (const update of updates) {
    const withVersion = replaceField(result, update.name, 'version', update.version)
    if (withVersion === undefined) throw new SandboxError(`${update.name} is not in the sandbox`)
    result = withVersion
    if (update.predecessorVersion !== null) {
      const withPredecessor = replaceField(
        result,
        update.name,
        'predecessorVersion',
        update.predecessorVersion
      )
      if (withPredecessor === undefined)
        throw new SandboxError(`${update.name} has no builtOn.predecessorVersion`)
      result = withPredecessor
    }
  }
  return result
}

/** `@kevinjohn/adonisjs-lucid-soft-delete` → `Soft Delete`, the name the specification uses. */
export function displayName(name: string): string {
  return name
    .replace(/^@kevinjohn\/adonisjs-(lucid-)?/, '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function versionPattern(version: string): string {
  return `${escapeRegExp(version)}(?!\\d)`
}

/**
 * Updates the specification's current-release table, its example package entry and prose such as
 * "Account Kit 0.3.4". Table cells keep their width so the table stays aligned.
 */
export function setSpecificationVersions(
  text: string,
  current: PackageConfig[],
  updates: VersionUpdate[]
): string {
  let result = text
  for (const update of updates) {
    const old = current.find((entry) => entry.name === update.name)?.version
    if (old === undefined || old === update.version) continue
    const display = escapeRegExp(displayName(update.name))

    result = result.replace(
      new RegExp(`^(\\| ${display} +\\| )${versionPattern(old)}( *)\\|`, 'gm'),
      (_match, head: string, padding: string) =>
        `${head}${update.version}${' '.repeat(Math.max(1, padding.length + old.length - update.version.length))}|`
    )
    result = result.replace(
      new RegExp(`(${display} )${versionPattern(old)}`, 'g'),
      (_match, head: string) => `${head}${update.version}`
    )
    result = replaceField(result, update.name, 'version', update.version) ?? result
  }
  return result
}
