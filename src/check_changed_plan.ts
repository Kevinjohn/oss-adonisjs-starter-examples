// Map a branch's changed files to the checks that cover them. Pure: no file system or processes.

const lintable = /\.(?:ts|mts|cts|js|mjs|cjs)$/
const typed =
  /(?:^(?:bin|src|tests)\/.+\.(?:ts|mts|cts)$|^tsconfig[^/]*\.json$|^package\.json$|^pnpm-lock\.yaml$)/
const dependencies = /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/
// A change to these can break files that did not change, so the whole repository is checked.
const formatConfig = /^(?:\.prettierignore|\.prettierrc[^/]*|prettier\.config\.[^/]+)$/
const lintConfig = /^eslint\.config\.[^/]+$/
const spec = /^tests\/.+\.spec\.ts$/
// The tooling and what every spec shares: a change can break any spec.
const suiteInput =
  /^(?:src\/.+|bin\/.+|tests\/helpers\/.+|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig[^/]*\.json)$/
// What assembly reads besides the tooling, and what it writes.
const assemblyInput =
  /^(?:config\/.+|resolutions\/.+|layers\/.+|templates\/.+|apps\/.+|\.gitattributes)$/

const minute = 60_000

export type CheckStep =
  | { id: string; command: string[]; tests?: 'japa'; timeoutMs: number; skip?: never }
  | { id: string; skip: string; command?: never; tests?: never; timeoutMs?: never }

/**
 * Plans checks for files changed since the merge base, including deleted paths. The static
 * option leaves out the full Japa suite and the assembly check; changed specs still run.
 */
export function planChecks(
  files: { path: string; deleted: boolean }[],
  options: { static?: boolean } = {}
): CheckStep[] {
  const present = files.filter((file) => !file.deleted).map((file) => file.path)
  const any = (pattern: RegExp) => files.some((file) => pattern.test(file.path))
  const steps: CheckStep[] = []
  const step = (
    id: string,
    run: boolean,
    command: string[],
    { skip, ...stepOptions }: { skip: string; tests?: 'japa'; timeoutMs?: number }
  ) => steps.push(run ? { id, command, timeoutMs: 5 * minute, ...stepOptions } : { id, skip })

  const wholeFormat = any(formatConfig) || any(dependencies)
  step(
    'format',
    present.length > 0 || wholeFormat,
    wholeFormat
      ? ['pnpm', 'format:check']
      : [
          'pnpm',
          'exec',
          'prettier',
          '--check',
          '--ignore-unknown',
          '--no-error-on-unmatched-pattern',
          '--',
          ...present,
        ],
    { skip: 'no existing changed files' }
  )
  const wholeLint = any(lintConfig) || any(dependencies)
  const lintFiles = present.filter((path) => lintable.test(path))
  step(
    'lint',
    lintFiles.length > 0 || wholeLint,
    wholeLint
      ? ['pnpm', 'lint']
      : // ESLint looks up the config nearest each named file, so an app's own config (and its
        // uninstalled plugins) would load. The root config ignores the apps, as `pnpm lint` does.
        [
          'pnpm',
          'exec',
          'eslint',
          '--config',
          'eslint.config.js',
          '--max-warnings',
          '0',
          '--no-warn-ignored',
          '--',
          ...lintFiles,
        ],
    { skip: 'no changed source files' }
  )
  step('typecheck', any(typed), ['pnpm', 'typecheck'], {
    skip: 'no TypeScript or type configuration changed',
  })

  const full = any(suiteInput)
  const specs = present.filter((path) => spec.test(path))
  if (full && !options.static) {
    step('tests', true, ['pnpm', 'test'], { tests: 'japa', timeoutMs: 15 * minute, skip: '' })
  } else {
    step('tests', specs.length > 0, ['pnpm', 'test', ...specs.map((path) => `--files=${path}`)], {
      tests: 'japa',
      skip: full ? 'no changed spec files' : 'no spec or tooling file changed',
    })
  }
  if (full && options.static) steps.push({ id: 'full-suite', skip: '--static leaves it out' })

  const assembly = any(assemblyInput) || full
  if (assembly && options.static) {
    steps.push({ id: 'assemble-check', skip: '--static leaves it out' })
  } else {
    step('assemble-check', assembly, ['pnpm', 'assemble', '--check'], {
      timeoutMs: 30 * minute,
      skip: 'nothing assembly reads changed',
    })
  }
  return steps
}

/** Strip terminal colours before reading a runner summary. */
function plain(output: string) {
  // eslint-disable-next-line no-control-regex
  return output.replace(/\u001b\[[0-9;]*m/g, '')
}

/** Count the tests Japa reported, or undefined when its summary is missing. */
export function countTests(output: string) {
  const match = /^\s*Tests\s+.*\((\d+)\)\s*$/m.exec(plain(output))
  return match ? Number(match[1]) : undefined
}

/** Count executed tests, leaving out Japa's skipped and todo tests. */
function countExecutedTests(output: string) {
  const summary = /^\s*Tests\s+(.+)\(\d+\)\s*$/m.exec(plain(output))?.[1] ?? ''
  return [...summary.matchAll(/(?:^|,\s*)(\d+)\s+(passed|failed|regression)\b/g)].reduce(
    (total, match) => total + Number(match[1]),
    0
  )
}

/** Why a step that ran failed, or undefined when it passed. */
export function stepProblem(
  step: { timeoutMs: number; tests?: 'japa' },
  result: { code: number | null; timedOut: boolean; output: string }
) {
  if (result.timedOut) return `stopped after ${step.timeoutMs / minute} minutes`
  if (result.code !== 0) return `exit ${result.code}`
  if (step.tests && (!countTests(result.output) || !countExecutedTests(result.output)))
    return 'ran no tests'
}
