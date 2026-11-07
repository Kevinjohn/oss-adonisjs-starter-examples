import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { SandboxError } from './errors.ts'

const BLOCK = 512

/** A NUL-terminated field of a tar header. */
function field(header: Buffer, start: number, length: number): string {
  const bytes = header.subarray(start, start + length)
  const end = bytes.indexOf(0)
  return bytes.subarray(0, end === -1 ? length : end).toString('utf8')
}

/** The `package/package.json` inside an npm archive (a gzipped tar), parsed. */
export function readArchiveManifest(path: string): Record<string, any> {
  const tar = gunzipSync(readFileSync(path))
  for (let offset = 0; offset + BLOCK <= tar.length;) {
    const header = tar.subarray(offset, offset + BLOCK)
    if (header.every((byte) => byte === 0)) break
    const name = field(header, 0, 100)
    const prefix = field(header, 345, 155)
    const size = Number.parseInt(field(header, 124, 12).trim() || '0', 8)
    const start = offset + BLOCK
    if ((prefix ? `${prefix}/${name}` : name) === 'package/package.json') {
      return JSON.parse(tar.subarray(start, start + size).toString('utf8'))
    }
    offset = start + Math.ceil(size / BLOCK) * BLOCK
  }
  throw new SandboxError(`${path} has no package/package.json`)
}

export interface PackedPackage {
  name: string
  version: string
  peerDependencies: Record<string, string>
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/**
 * Exact peers that name another packed package at a different version (main mode, rule 5). A
 * range peer is not checked: npm decides whether it is satisfied.
 */
export function runtimePeerMismatches(packed: PackedPackage[]): string[] {
  const mismatches: string[] = []
  for (const pkg of packed) {
    for (const [peer, range] of Object.entries(pkg.peerDependencies)) {
      const other = packed.find((entry) => entry.name === peer)
      if (other && EXACT_VERSION.test(range) && range !== other.version) {
        mismatches.push(
          `runtime peer mismatch: ${pkg.name}@${pkg.version} peers on ${peer} ${range}; main packs ${peer}@${other.version}`
        )
      }
    }
  }
  return mismatches
}
