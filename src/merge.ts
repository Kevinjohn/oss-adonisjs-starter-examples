import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { SandboxError } from './errors.ts'
import { writeFileWithMode } from './file_tree.ts'
import { type Git, GitCommandError } from './git.ts'
import type { Lineage, LineageEntry } from './lineage.ts'
import { MISSING, mergePackageJson, serialisePackageJson } from './package_json_merge.ts'
import { shortName } from './release_assets.ts'
import {
  type ConflictInputs,
  type ConflictSide,
  type ResolutionStore,
  writePendingConflict,
} from './resolutions.ts'

export interface MergeOptions {
  /** The scratch repository holding the lineage; its work tree is used for merging. */
  git: Git
  kit: string
  lineage: Lineage
  store: ResolutionStore
  /** Where pending conflicts go: `tmp/conflicts` or `<out>/conflicts`. */
  pendingRoot: string
  /** Folder for temporary merge-file inputs. */
  scratchDirectory: string
}

export type MergeOutcome = { ok: true; head: string } | { ok: false; report: string }

interface Unresolved {
  file: string
  keys?: string[]
}

const SUPPORTED_CODES = new Set(['UU', 'AA', 'UD', 'DU'])

function isGenerated(path: string): boolean {
  return path === 'database/schema.ts' || path.startsWith('.adonisjs/')
}

function readBlob(git: Git, side: ConflictSide): Buffer {
  return side ? git.run(['cat-file', 'blob', side.blob]).stdout : Buffer.alloc(0)
}

/** The blob and mode of a path in a commit, or null. */
function sideAt(git: Git, commit: string, path: string): ConflictSide {
  const line = git.text(['ls-tree', commit, '--', path])
  if (line === '') return null
  const [mode, , blob] = line.split('\t')[0].split(' ')
  return { blob, mode }
}

function writeToWorkTree(git: Git, path: string, bytes: Buffer, mode: string): void {
  writeFileWithMode(join(git.cwd, path), bytes, mode === '100755')
  git.run(['add', '-f', '--', path])
}

function removeFromWorkTree(git: Git, path: string): void {
  git.run(['rm', '-q', '-f', '--ignore-unmatch', '--', path])
  rmSync(join(git.cwd, path), { force: true })
}

/** A diff3 merge of three sides with `git merge-file`; a missing side is an empty file. */
function diff3(git: Git, scratch: string, inputs: ConflictInputs): Buffer {
  const folder = mkdtempSync(join(scratch, 'merge-file-'))
  try {
    const files = (['ours', 'base', 'theirs'] as const).map((side) => {
      const file = join(folder, side)
      writeFileSync(file, readBlob(git, inputs[side]))
      return file
    })
    const result = git.run(
      ['merge-file', '-p', '--diff3', '-L', 'ours', '-L', 'base', '-L', 'theirs', ...files],
      {
        allowFailure: true,
      }
    )
    if (result.code < 0 || result.code > 127)
      throw new GitCommandError(['merge-file', ...files], result)
    return result.stdout
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

function parseJson(git: Git, side: ConflictSide, where: string): unknown {
  if (!side) return MISSING
  try {
    return JSON.parse(readBlob(git, side).toString('utf8'))
  } catch {
    throw new SandboxError(`package.json in ${where} is not valid JSON`)
  }
}

/**
 * Step 1 of specification 6.4: the structural merge of `package.json`.
 */
function mergePackageJsonStep(
  options: MergeOptions,
  entry: LineageEntry,
  unresolved: Unresolved[]
): void {
  const { git } = options
  const mergeBase = git.text(['merge-base', 'HEAD', 'MERGE_HEAD'])
  const inputs: ConflictInputs = {
    path: 'package.json',
    base: sideAt(git, mergeBase, 'package.json'),
    ours: sideAt(git, 'HEAD', 'package.json'),
    theirs: sideAt(git, 'MERGE_HEAD', 'package.json'),
  }
  const merged = mergePackageJson(
    parseJson(git, inputs.base, 'the merge base'),
    parseJson(git, inputs.ours, 'the app'),
    parseJson(git, inputs.theirs, entry.label)
  )

  if (merged.conflicts.length === 0) {
    if (merged.value === MISSING) removeFromWorkTree(git, 'package.json')
    else
      writeToWorkTree(
        git,
        'package.json',
        Buffer.from(serialisePackageJson(merged.value)),
        '100644'
      )
    return
  }

  const recorded = options.store.find(shortName(entry.pkg.name), inputs)
  if (recorded?.result === 'delete') return removeFromWorkTree(git, 'package.json')
  if (recorded) {
    const value = JSON.parse(recorded.content!.toString('utf8'))
    return writeToWorkTree(git, 'package.json', Buffer.from(serialisePackageJson(value)), '100644')
  }

  const file = writePendingConflict(
    options.pendingRoot,
    options.kit,
    shortName(entry.pkg.name),
    inputs,
    diff3(git, options.scratchDirectory, inputs),
    merged.conflicts
  )
  unresolved.push({ file, keys: merged.conflicts })
}

interface Stage {
  mode: string
  blob: string
}

function conflictedPaths(git: Git): Map<string, Partial<Record<1 | 2 | 3, Stage>>> {
  const paths = new Map<string, Partial<Record<1 | 2 | 3, Stage>>>()
  for (const line of git.list(['ls-files', '-u', '-z'])) {
    const [info, path] = line.split('\t')
    const [mode, blob, stage] = info.split(' ')
    const stages = paths.get(path) ?? {}
    stages[Number(stage) as 1 | 2 | 3] = { mode, blob }
    paths.set(path, stages)
  }
  return paths
}

function statusCodes(git: Git): Map<string, string> {
  const codes = new Map<string, string>()
  for (const item of git.list(['status', '--porcelain=v1', '-z', '--untracked-files=no'])) {
    codes.set(item.slice(3), item.slice(0, 2))
  }
  return codes
}

/**
 * The reason a conflict cannot be resolved by a recorded file (D8), or null when it can.
 */
export function unsupportedReason(
  git: Git,
  code: string | undefined,
  stages: Partial<Record<1 | 2 | 3, Stage>>
): string | null {
  const present = Object.values(stages)
  if (!code || !SUPPORTED_CODES.has(code)) return code ?? 'unknown'
  if (present.some((stage) => stage.mode === '120000')) return 'symlink'
  if (present.some((stage) => stage.mode === '160000')) return 'submodule'
  if (new Set(present.map((stage) => stage.mode)).size > 1) return 'mode'
  if (present.some((stage) => readBlob(git, stage).includes(0))) return 'binary'
  return null
}

/**
 * Merges each package commit into the app branch in lineage order (specification 6.3, merging,
 * and 6.4). Stops at the first merge that leaves conflicts.
 */
export function mergeLineage(options: MergeOptions): MergeOutcome {
  const { git, lineage, kit } = options
  git.run(['switch', '-q', '-C', 'app', lineage.base])

  for (const entry of lineage.entries) {
    const result = git.run(['merge', '--no-ff', '--no-commit', '-X', 'no-renames', entry.commit], {
      allowFailure: true,
    })
    const merging = existsSync(join(git.text(['rev-parse', '--absolute-git-dir']), 'MERGE_HEAD'))
    if (!merging || (result.code !== 0 && result.code !== 1)) {
      throw new GitCommandError(['merge', entry.commit], result)
    }

    const unresolved: Unresolved[] = []
    mergePackageJsonStep(options, entry, unresolved)

    const codes = statusCodes(git)
    for (const [path, stages] of conflictedPaths(git)) {
      if (path === 'package.json') continue
      const reason = unsupportedReason(git, codes.get(path), stages)
      if (reason) {
        git.run(['merge', '--abort'])
        // Git moves one side of a file/directory conflict to `<path>~<branch>` and reports it as
        // added by one side only; name the path both packages wrote.
        const fileOrDirectory = reason === 'AU' || reason === 'UA'
        const shown = fileOrDirectory ? path.replace(/~[^/]+$/, '') : path
        throw new SandboxError(
          `Unsupported conflict (${fileOrDirectory ? 'file/directory' : reason}) on ${shown} while merging ${entry.label}. Change the package example so it does not conflict, then run again.`
        )
      }
      if (isGenerated(path)) {
        const chosen = stages[2] ?? stages[3]!
        writeToWorkTree(git, path, readBlob(git, chosen), chosen.mode)
        continue
      }
      const inputs: ConflictInputs = {
        path,
        base: stages[1] ?? null,
        ours: stages[2] ?? null,
        theirs: stages[3] ?? null,
      }
      const recorded = options.store.find(shortName(entry.pkg.name), inputs)
      if (recorded?.result === 'delete') {
        removeFromWorkTree(git, path)
      } else if (recorded) {
        writeToWorkTree(git, path, recorded.content!, (stages[2] ?? stages[3])!.mode)
      } else {
        const file = writePendingConflict(
          options.pendingRoot,
          kit,
          shortName(entry.pkg.name),
          inputs,
          diff3(git, options.scratchDirectory, inputs)
        )
        unresolved.push({ file })
      }
    }

    if (unresolved.length > 0) {
      git.run(['merge', '--abort'])
      return { ok: false, report: conflictReport(entry.label, kit, unresolved) }
    }
    if (
      git.text(['diff', '--name-only', '--diff-filter=U']) !== '' ||
      !git.succeeds(['diff', '--quiet'])
    ) {
      throw new Error(`Merging ${entry.label} into ${kit} left the index and work tree out of step`)
    }
    git.run(['commit', '-q', '--no-edit', '-m', `merge ${entry.label}`])
  }
  return { ok: true, head: git.text(['rev-parse', 'HEAD']) }
}

function conflictReport(label: string, kit: string, unresolved: Unresolved[]): string {
  const lines = unresolved.map(({ file, keys }) => {
    const shown = relative(process.cwd(), file).startsWith('..')
      ? file
      : relative(process.cwd(), file)
    return `  ${shown}${keys ? ` (keys: ${keys.join(', ')})` : ''}`
  })
  return [
    `Merging ${label} into ${kit} left ${unresolved.length} conflict(s):`,
    ...lines,
    'Edit each file to the merged content and remove every conflict marker. Then run',
    `  pnpm resolve --kit ${kit}`,
    'and add --delete <path> for a file that should not exist. Then run pnpm assemble again.',
  ].join('\n')
}
