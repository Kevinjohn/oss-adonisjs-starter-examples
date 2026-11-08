import ts from 'typescript'

/**
 * Files that are mostly lists both packages add to: providers, preloads and commands in
 * `adonisrc.ts`, middleware in `start/kernel.ts`, and environment variables. Routes are left out,
 * because their order matters.
 */
const REGISTRY_FILES = new Set(['adonisrc.ts', 'start/kernel.ts', 'start/env.ts', '.env.example'])

interface Hunk {
  ours: string[]
  base: string[]
  theirs: string[]
}

/** Splits diff3 output into plain line runs and conflict hunks, or null if it is malformed. */
function parseDiff3(text: string): (string[] | Hunk)[] | null {
  const parts: (string[] | Hunk)[] = []
  let plain: string[] = []
  let hunk: Hunk | null = null
  let side: keyof Hunk = 'ours'
  for (const line of text.split('\n')) {
    if (line.startsWith('<<<<<<< ')) {
      if (hunk) return null
      parts.push(plain)
      plain = []
      hunk = { ours: [], base: [], theirs: [] }
      side = 'ours'
    } else if (line.startsWith('||||||| ') && hunk && side === 'ours') side = 'base'
    else if (line === '=======' && hunk && side === 'base') side = 'theirs'
    else if (line.startsWith('>>>>>>> ') && hunk && side === 'theirs') {
      parts.push(hunk)
      hunk = null
    } else if (hunk) hunk[side].push(line)
    else plain.push(line)
  }
  if (hunk) return null
  parts.push(plain)
  return parts
}

const startsWith = (lines: string[], prefix: string[]) =>
  prefix.every((line, index) => lines[index] === line)
const endsWith = (lines: string[], suffix: string[]) =>
  suffix.every((line, index) => lines[lines.length - suffix.length + index] === line)

/** Both sides' added lines: once when they are the same, else ours then theirs; null on overlap. */
function union(ours: string[], theirs: string[]): string[] | null {
  if (ours.length === theirs.length && ours.every((line, index) => theirs[index] === line))
    return ours
  // A line both added, other than punctuation or a blank line, means they may add the same entry
  // in different shapes; a person decides.
  const meaningful = (line: string) => /[A-Za-z0-9]/.test(line)
  if (ours.some((line) => meaningful(line) && theirs.includes(line))) return null
  return [...ours, ...theirs]
}

/**
 * Both sides only added lines next to the same unchanged base lines: keeps the base lines and
 * both sides' additions. Null when either side changed or removed a base line.
 */
function bothAdded({ ours, base, theirs }: Hunk): string[] | null {
  if (startsWith(ours, base) && startsWith(theirs, base)) {
    const added = union(ours.slice(base.length), theirs.slice(base.length))
    return added && [...base, ...added]
  }
  if (endsWith(ours, base) && endsWith(theirs, base)) {
    const added = union(
      ours.slice(0, ours.length - base.length),
      theirs.slice(0, theirs.length - base.length)
    )
    return added && [...added, ...base]
  }
  return null
}

function validTypeScript(path: string, text: string): boolean {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
  return (file as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics.length === 0
}

function validEnvFile(text: string): boolean {
  const keys = new Set<string>()
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.startsWith('#')) continue
    const key = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1]
    if (!key || keys.has(key)) return false
    keys.add(key)
  }
  return true
}

/**
 * Resolves a registry file's text conflict when, in every hunk, both sides only added lines at the
 * same place (specification 6.4, step 5). The result must parse: TypeScript without syntax
 * errors, or an env file with one assignment per key. Returns null when it does not apply, so the
 * conflict goes to a person. A recorded resolution for the exact inputs is used before this.
 */
export function resolveRegistryConflict(path: string, diff3: Buffer): Buffer | null {
  if (!REGISTRY_FILES.has(path)) return null
  const text = diff3.toString('utf8')
  if (text.includes('\0')) return null
  const parts = parseDiff3(text)
  if (!parts || !parts.some((part) => !Array.isArray(part))) return null
  const lines: string[] = []
  for (const part of parts) {
    if (Array.isArray(part)) {
      lines.push(...part)
      continue
    }
    const merged = bothAdded(part)
    if (!merged) return null
    lines.push(...merged)
  }
  const result = lines.join('\n')
  const valid = path.endsWith('.ts') ? validTypeScript(path, result) : validEnvFile(result)
  return valid ? Buffer.from(result) : null
}
