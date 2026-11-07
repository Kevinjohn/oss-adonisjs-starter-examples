import { join, relative } from 'node:path'
import { rmSync } from 'node:fs'
import { createWorkDirectory, mergeKit } from './assembly.ts'
import type { Kit, SandboxConfig } from './sandbox_config.ts'
import type { RemoteUrlFor } from './tree_source.ts'

/**
 * `pnpm resolve --prune-unused` (specification 6.5 step 5): merges the kit and, only when every
 * merge succeeds, deletes the resolutions no conflict matched.
 */
export function pruneUnusedResolutions(options: {
  root: string
  config: SandboxConfig
  kit: Kit
  remoteUrlFor: RemoteUrlFor
  log: (line: string) => void
}): boolean {
  const work = createWorkDirectory(options.root, options.kit)
  try {
    const { context, outcome } = mergeKit({ ...options, work })
    if (!outcome.ok) {
      options.log(outcome.report)
      options.log('Nothing pruned.')
      return false
    }
    for (const key of context.store.pruneUnused()) {
      options.log(`deleted ${relative(options.root, join(context.store.folder, key))}`)
    }
    return true
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
