import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { SANDBOX_ROOT, runCli } from '../src/cli.ts'
import { SandboxError } from '../src/errors.ts'
import { rebaseLayer } from '../src/rebase_layer.ts'
import { readSandboxConfig } from '../src/sandbox_config.ts'
import { githubUrlFor } from '../src/tree_source.ts'

/**
 * pnpm rebase-layer --package <name> --root <package checkout> (--to <version> | --base <commit>)
 */
runCli(async () => {
  const { values } = parseArgs({
    options: {
      package: { type: 'string' },
      root: { type: 'string' },
      to: { type: 'string' },
      base: { type: 'string' },
    },
  })
  if (!values.package || !values.root)
    throw new SandboxError('Pass --package <name> and --root <dir>')
  if ((values.to === undefined) === (values.base === undefined))
    throw new SandboxError('Pass exactly one of --to <version> and --base <commit>')
  const config = readSandboxConfig(join(SANDBOX_ROOT, 'config/sandbox.json'))
  return rebaseLayer({
    root: SANDBOX_ROOT,
    config,
    packageName: values.package.startsWith('@')
      ? values.package
      : `@kevinjohn/adonisjs-${values.package}`,
    packageRoot: resolve(values.root),
    to: values.to !== undefined ? { predecessorVersion: values.to } : { base: values.base! },
    remoteUrlFor: githubUrlFor,
    log: (line) => console.log(line),
  })
})
