import { join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import { resolveOutDirectory } from '../src/assembly.ts'
import { pruneUnusedResolutions, refusePruneWithLocalPending } from '../src/resolve_command.ts'
import { SANDBOX_ROOT, runCli } from '../src/cli.ts'
import { SandboxError } from '../src/errors.ts'
import { resolvePendingConflicts } from '../src/resolutions.ts'
import { type Kit, readSandboxConfig } from '../src/sandbox_config.ts'
import { githubUrlFor } from '../src/tree_source.ts'

/**
 * pnpm resolve --kit <kit> [--pending <dir>] [--delete <path>]... [--prune-unused]
 */
runCli(async () => {
  const { values } = parseArgs({
    options: {
      'kit': { type: 'string' },
      'pending': { type: 'string', default: 'tmp/conflicts' },
      'delete': { type: 'string', multiple: true, default: [] },
      'prune-unused': { type: 'boolean', default: false },
    },
  })
  if (!values.kit) throw new SandboxError('Pass --kit <kit>')
  const config = readSandboxConfig(join(SANDBOX_ROOT, 'config/sandbox.json'))
  if (!config.kits.includes(values.kit as Kit)) throw new SandboxError(`Unknown kit ${values.kit}`)

  const pendingRoot = resolveOutDirectory(SANDBOX_ROOT, values.pending, '--pending')
  if (values['prune-unused']) refusePruneWithLocalPending(SANDBOX_ROOT, pendingRoot)

  const saved = resolvePendingConflicts({
    pendingRoot,
    resolutionsRoot: join(SANDBOX_ROOT, 'resolutions'),
    kit: values.kit,
    deletes: values.delete,
  })
  for (const path of saved) console.log(`saved ${relative(SANDBOX_ROOT, path)}`)
  if (!values['prune-unused']) return true

  return pruneUnusedResolutions({
    root: SANDBOX_ROOT,
    config,
    kit: values.kit as Kit,
    remoteUrlFor: githubUrlFor,
    log: (line) => console.log(line),
  })
})
