import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Configuration passed on every git command so results do not depend on the machine's own git
 * configuration (specification 6.3).
 */
const ISOLATED_CONFIG = [
  'core.autocrlf=false',
  'core.filemode=true',
  'commit.gpgsign=false',
  'tag.gpgsign=false',
  'rerere.enabled=false',
  'core.hooksPath=/dev/null',
  'core.excludesFile=/dev/null',
  'core.attributesFile=/dev/null',
  'merge.conflictStyle=diff3',
  'init.defaultBranch=main',
  'advice.detachedHead=false',
  'gc.auto=0',
  'maintenance.auto=false',
]

const FIXED_IDENTITY = {
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'starter-examples',
  GIT_AUTHOR_EMAIL: 'starter-examples@invalid',
  GIT_COMMITTER_NAME: 'starter-examples',
  GIT_COMMITTER_EMAIL: 'starter-examples@invalid',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
  LC_ALL: 'C',
}

export interface GitResult {
  code: number
  stdout: Buffer
  stderr: string
}

export interface GitRunOptions {
  input?: Buffer | string
  /** Return non-zero exits instead of throwing. */
  allowFailure?: boolean
  env?: Record<string, string>
}

export class GitCommandError extends Error {
  constructor(
    readonly args: string[],
    readonly result: GitResult
  ) {
    super(
      `git ${args.join(' ')} failed with exit ${result.code}\n${result.stderr}${result.stdout.toString('utf8')}`
    )
    this.name = 'GitCommandError'
  }
}

/**
 * The process environment without any inherited `GIT_*` variable, plus the fixed identity.
 */
function gitEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value
  }
  return { ...env, ...FIXED_IDENTITY, ...extra }
}

/**
 * Runs git in one folder with the isolated configuration of specification 6.3.
 */
export class Git {
  constructor(readonly cwd: string) {}

  run(args: string[], options: GitRunOptions = {}): GitResult {
    const configArgs = ISOLATED_CONFIG.flatMap((entry) => ['-c', entry])
    const child = spawnSync('git', [...configArgs, ...args], {
      cwd: this.cwd,
      env: gitEnvironment(options.env),
      input: options.input,
      maxBuffer: 1024 * 1024 * 1024,
    })
    if (child.error) throw child.error
    const result: GitResult = {
      code: child.status ?? 1,
      stdout: child.stdout,
      stderr: child.stderr.toString('utf8'),
    }
    if (result.code !== 0 && !options.allowFailure) throw new GitCommandError(args, result)
    return result
  }

  /** Standard output as UTF-8 with the final newline removed. */
  text(args: string[], options: GitRunOptions = {}): string {
    return this.run(args, options).stdout.toString('utf8').replace(/\n$/, '')
  }

  /** NUL-separated standard output as a list, without the empty last item. */
  list(args: string[], options: GitRunOptions = {}): string[] {
    return this.run(args, options)
      .stdout.toString('utf8')
      .split('\0')
      .filter((item) => item !== '')
  }

  succeeds(args: string[]): boolean {
    return this.run(args, { allowFailure: true }).code === 0
  }
}

/**
 * Extracts `git archive --format=tar <treeish>` into an existing folder, keeping modes.
 */
export function extractArchive(git: Git, treeish: string, destination: string): void {
  const archive = git.run(['archive', '--format=tar', treeish]).stdout
  // A minimal environment, so options such as TAR_OPTIONS cannot change what is extracted.
  const tar = spawnSync('tar', ['-x', '-C', destination], {
    env: { PATH: process.env.PATH ?? '', LC_ALL: 'C' },
    input: archive,
    maxBuffer: 1024 * 1024 * 1024,
  })
  if (tar.error) throw tar.error
  if (tar.status !== 0) {
    throw new Error(`tar -x -C ${destination} failed: ${tar.stderr.toString('utf8')}`)
  }
}

/**
 * Creates a repository whose attributes stop git from converting line endings, or from dropping
 * or rewriting files marked `export-ignore` or `export-subst` when it archives a tree.
 */
export function initRepository(path: string, options: { bare?: boolean } = {}): Git {
  mkdirSync(path, { recursive: true })
  const git = new Git(path)
  git.run(['init', '-q', ...(options.bare ? ['--bare'] : [])])
  const infoDirectory = join(path, options.bare ? '' : '.git', 'info')
  mkdirSync(infoDirectory, { recursive: true })
  writeFileSync(join(infoDirectory, 'attributes'), '* -text -export-ignore -export-subst\n')
  return git
}
