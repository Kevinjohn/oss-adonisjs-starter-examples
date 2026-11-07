import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { resolveOutDirectory, runAssembly } from '../src/assembly.ts'
import { SANDBOX_ROOT, runCli } from '../src/cli.ts'
import { processRunner } from '../src/command_runner.ts'
import { SandboxError } from '../src/errors.ts'
import { type Kit, readSandboxConfig } from '../src/sandbox_config.ts'
import { githubUrlFor } from '../src/tree_source.ts'

/**
 * pnpm assemble [--kit <kit>]... [--check] [--with-local <root> --out <dir>]
 */
runCli(async () => {
  const { values } = parseArgs({
    options: {
      'kit': { type: 'string', multiple: true },
      'check': { type: 'boolean', default: false },
      'with-local': { type: 'string' },
      'out': { type: 'string' },
    },
  })
  if ((values['with-local'] === undefined) !== (values.out === undefined)) {
    throw new SandboxError('--with-local and --out go together')
  }
  if (values.check && values['with-local'])
    throw new SandboxError('--check cannot be combined with --with-local')

  const config = readSandboxConfig(resolve(SANDBOX_ROOT, 'config/sandbox.json'))
  const kits = (values.kit ?? config.kits) as Kit[]
  for (const kit of kits) {
    if (!config.kits.includes(kit))
      throw new SandboxError(
        `Unknown kit ${kit}; config/sandbox.json has ${config.kits.join(', ')}`
      )
  }

  return runAssembly({
    root: SANDBOX_ROOT,
    config,
    kits,
    mode: values.check ? 'check' : 'assemble',
    local: values['with-local']
      ? { root: resolve(values['with-local']), out: resolveOutDirectory(SANDBOX_ROOT, values.out!) }
      : undefined,
    remoteUrlFor: githubUrlFor,
    runner: processRunner({ stream: false }),
    log: (line) => console.log(line),
  })
})
