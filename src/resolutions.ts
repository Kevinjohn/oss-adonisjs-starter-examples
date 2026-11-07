import { existsSync, readFileSync, rmSync, readdirSync, rmdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { SandboxError } from './errors.ts'
import { listFiles, writeFileWithMode } from './file_tree.ts'

/** One side of a conflict: the blob and mode, or null when the file does not exist there. */
export type ConflictSide = { blob: string; mode: string } | null

export interface ConflictInputs {
  path: string
  base: ConflictSide
  ours: ConflictSide
  theirs: ConflictSide
}

export interface InputsFile extends ConflictInputs {
  /** `null` while pending; set by `pnpm resolve`. */
  result: 'content' | 'delete' | null
  /** For `package.json`, the key paths that conflicted. Pending files only. */
  conflictingKeys?: string[]
}

const INPUTS_SUFFIX = '.inputs.json'
const MARKER = /^(<{7}|\|{7}|={7}|>{7})/m

function sameSide(a: ConflictSide, b: ConflictSide): boolean {
  return a === null || b === null ? a === b : a.blob === b.blob && a.mode === b.mode
}

export function sameInputs(a: ConflictInputs, b: ConflictInputs): boolean {
  return (
    a.path === b.path &&
    sameSide(a.base, b.base) &&
    sameSide(a.ours, b.ours) &&
    sameSide(a.theirs, b.theirs)
  )
}

function serialiseInputs(inputs: InputsFile): string {
  const { path, base, ours, theirs, result, conflictingKeys } = inputs
  const value = conflictingKeys
    ? { path, base, ours, theirs, result, conflictingKeys }
    : { path, base, ours, theirs, result }
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Every `.inputs.json` file under a folder, as paths relative to it, without the suffix. */
function inputsFilesUnder(folder: string): string[] {
  if (!existsSync(folder)) return []
  return listFiles(folder)
    .map((entry) => entry.path)
    .filter((path) => path.endsWith(INPUTS_SUFFIX))
    .map((path) => path.slice(0, -INPUTS_SUFFIX.length))
}

function removeEmptyFolders(folder: string, stop: string): void {
  let current = folder
  while (
    current.startsWith(stop) &&
    current !== stop &&
    existsSync(current) &&
    readdirSync(current).length === 0
  ) {
    rmdirSync(current)
    current = dirname(current)
  }
}

/**
 * The recorded resolutions of one kit, `resolutions/<kit>/<short>/<path>` (specification 5.3).
 * Remembers which ones a run used.
 */
export class ResolutionStore {
  readonly folder: string
  readonly used = new Set<string>()

  constructor(resolutionsRoot: string, kit: string) {
    this.folder = join(resolutionsRoot, kit)
  }

  /** The recorded result for a conflict when all three inputs match exactly, else null. */
  find(
    short: string,
    inputs: ConflictInputs
  ): { result: 'content' | 'delete'; content: Buffer | null } | null {
    const key = `${short}/${inputs.path}`
    const inputsPath = join(this.folder, key + INPUTS_SUFFIX)
    if (!existsSync(inputsPath)) return null
    const recorded: InputsFile = JSON.parse(readFileSync(inputsPath, 'utf8'))
    if (!sameInputs(recorded, inputs) || recorded.result === null) return null
    this.used.add(key)
    return {
      result: recorded.result,
      content: recorded.result === 'content' ? readFileSync(join(this.folder, key)) : null,
    }
  }

  /** Recorded resolutions no conflict in this run matched, as `resolutions/<kit>/...` keys. */
  unused(): string[] {
    return inputsFilesUnder(this.folder).filter((key) => !this.used.has(key))
  }

  /** Deletes the unused resolutions and returns their paths relative to the store's folder. */
  pruneUnused(): string[] {
    const removed = this.unused()
    for (const key of removed) {
      rmSync(join(this.folder, key), { force: true })
      rmSync(join(this.folder, key + INPUTS_SUFFIX), { force: true })
      removeEmptyFolders(dirname(join(this.folder, key)), this.folder)
    }
    return removed
  }
}

/**
 * Writes a pending conflict, `<pendingRoot>/<kit>/<short>/<path>` and its inputs file with
 * `"result": null`. Returns the content file path.
 */
export function writePendingConflict(
  pendingRoot: string,
  kit: string,
  short: string,
  inputs: ConflictInputs,
  content: Buffer,
  conflictingKeys?: string[]
): string {
  const contentPath = join(pendingRoot, kit, short, inputs.path)
  writeFileWithMode(contentPath, content, false)
  writeFileWithMode(
    contentPath + INPUTS_SUFFIX,
    Buffer.from(serialiseInputs({ ...inputs, result: null, conflictingKeys })),
    false
  )
  return contentPath
}

/**
 * `pnpm resolve` steps 1 to 4 (specification 6.5): validates every pending file of the kit, then
 * moves them into `resolutions/`. Copies nothing when any check fails. Returns the saved paths.
 */
export function resolvePendingConflicts(options: {
  pendingRoot: string
  resolutionsRoot: string
  kit: string
  deletes: string[]
}): string[] {
  const pendingFolder = join(options.pendingRoot, options.kit)
  const pending = inputsFilesUnder(pendingFolder).map((key) => {
    const inputs: InputsFile = JSON.parse(
      readFileSync(join(pendingFolder, key + INPUTS_SUFFIX), 'utf8')
    )
    return { key, inputs, contentPath: join(pendingFolder, key) }
  })

  const problems: string[] = []
  for (const path of options.deletes) {
    if (!pending.some((entry) => entry.inputs.path === path))
      problems.push(`No pending conflict for ${path}`)
  }
  for (const entry of pending) {
    if (options.deletes.includes(entry.inputs.path)) continue
    const shown = relative(process.cwd(), entry.contentPath)
    if (!existsSync(entry.contentPath)) {
      problems.push(`${shown} is missing; edit it, or pass --delete ${entry.inputs.path}`)
      continue
    }
    const text = readFileSync(entry.contentPath, 'utf8')
    if (MARKER.test(text)) {
      problems.push(`${shown} still has conflict markers`)
      continue
    }
    if (entry.inputs.path === 'package.json') {
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = undefined
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        problems.push(`${shown} is not a JSON object`)
      }
    }
  }
  if (problems.length > 0) throw new SandboxError(problems.join('\n'))

  const saved: string[] = []
  const store = join(options.resolutionsRoot, options.kit)
  for (const entry of pending) {
    const result = options.deletes.includes(entry.inputs.path) ? 'delete' : 'content'
    const target = join(store, entry.key)
    const { path, base, ours, theirs } = entry.inputs
    const inputs = { path, base, ours, theirs }
    if (result === 'content') {
      writeFileWithMode(target, readFileSync(entry.contentPath), false)
    } else {
      rmSync(target, { force: true })
    }
    writeFileWithMode(
      target + INPUTS_SUFFIX,
      Buffer.from(serialiseInputs({ ...inputs, result })),
      false
    )
    rmSync(entry.contentPath, { force: true })
    rmSync(entry.contentPath + INPUTS_SUFFIX, { force: true })
    removeEmptyFolders(dirname(entry.contentPath), options.pendingRoot)
    saved.push(target)
  }
  return saved
}
