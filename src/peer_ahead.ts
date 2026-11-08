import type { SandboxConfig } from './sandbox_config.ts'

/** Written into `<out>/<kit>/` instead of an app; `pnpm test:app` reads it and skips. */
export const PEER_AHEAD_FILE = '.peer-ahead'

function release(version: unknown): number[] | null {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) return null
  return version.split('.').map(Number)
}

function newer(left: number[], right: number[]): boolean {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] > right[index]
  }
  return false
}

/**
 * The note for a `--with-local` package that peers on a newer release of the package it builds on
 * than the sandbox uses (specification 6.8), or null. Such a package cannot be combined until the
 * sandbox moves (16.5). Ranges, pre-releases and older versions return null, so they still fail
 * the lineage peer check.
 */
export function peerAheadNote(
  config: SandboxConfig,
  manifest: { name: string; peerDependencies?: Record<string, string> }
): string | null {
  const pkg = config.packages.find((entry) => entry.name === manifest.name)
  if (!pkg || pkg.buildsOn === null) return null
  const predecessor = config.packages.find((entry) => entry.name === pkg.buildsOn)!
  const peer = manifest.peerDependencies?.[pkg.buildsOn]
  const wanted = release(peer)
  const used = release(predecessor.version)
  if (!wanted || !used || !newer(wanted, used)) return null
  return `${pkg.name} peers on ${pkg.buildsOn} ${peer}; the sandbox uses ${pkg.buildsOn}@${predecessor.version}. Skipped: the sandbox pull request that moves ${pkg.buildsOn} to ${peer} combines this change (16.5).`
}
