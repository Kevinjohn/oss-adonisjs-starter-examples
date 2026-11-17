import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { SandboxError } from './errors.ts'

/** Prevent pnpm from walking upward and using the repository workspace. */
export function requireOwnWorkspace(app: string, kit: string): void {
  if (!existsSync(join(app, 'pnpm-workspace.yaml'))) {
    throw new SandboxError(
      `${kit} has no pnpm-workspace.yaml, so pnpm would use the repository workspace. Keep the starter kit's pnpm-workspace.yaml.`
    )
  }
}
