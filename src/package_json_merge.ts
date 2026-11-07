/** Marks a key or file that does not exist, which is different from `null`. */
export const MISSING = Symbol('missing')
export type JsonValue = unknown

export interface PackageJsonMergeResult {
  /** The merged value, or MISSING when the file should not exist. */
  value: JsonValue | typeof MISSING
  /** Key paths that changed differently on both sides, such as `scripts.test`. */
  conflicts: string[]
}

const INSTALL_MAPS = new Set(['dependencies', 'devDependencies', 'optionalDependencies'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a)
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]))
    )
  }
  return false
}

/**
 * Keys whose differences are ignored because normalisation rewrites them: `name`,
 * `scripts.kit:pack` and our own packages in the install maps.
 */
function isNormalisedKey(path: string[]): boolean {
  if (path.length === 1) return path[0] === 'name'
  if (path.length !== 2) return false
  if (path[0] === 'scripts') return path[1] === 'kit:pack'
  return INSTALL_MAPS.has(path[0]) && path[1].startsWith('@kevinjohn/')
}

function mergeValue(
  path: string[],
  o: unknown,
  a: unknown,
  b: unknown,
  conflicts: string[]
): unknown {
  if (deepEqual(a, b)) return a
  if (deepEqual(a, o)) return b
  if (deepEqual(b, o)) return a
  if (isPlainObject(a) && isPlainObject(b) && (o === MISSING || isPlainObject(o))) {
    const base = isPlainObject(o) ? o : {}
    const keys = [...Object.keys(a)]
    for (const key of Object.keys(b)) if (!Object.hasOwn(a, key)) keys.push(key)
    for (const key of Object.keys(base))
      if (!Object.hasOwn(a, key) && !Object.hasOwn(b, key)) keys.push(key)

    const merged: Record<string, unknown> = {}
    for (const key of keys) {
      const value = mergeValue(
        [...path, key],
        Object.hasOwn(base, key) ? base[key] : MISSING,
        Object.hasOwn(a, key) ? a[key] : MISSING,
        Object.hasOwn(b, key) ? b[key] : MISSING,
        conflicts
      )
      // defineProperty keeps a `__proto__` key as data instead of changing the prototype.
      if (value !== MISSING) {
        Object.defineProperty(merged, key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        })
      }
    }
    return merged
  }
  if (isNormalisedKey(path)) return a
  conflicts.push(path.length === 0 ? '(whole file)' : path.join('.'))
  return a
}

/**
 * The structural three-way merge of `package.json` (specification 6.4). Each input is the parsed
 * file or MISSING.
 */
export function mergePackageJson(o: JsonValue, a: JsonValue, b: JsonValue): PackageJsonMergeResult {
  const conflicts: string[] = []
  const value = mergeValue([], o, a, b, conflicts)
  return { value, conflicts }
}

export function serialisePackageJson(value: JsonValue): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
