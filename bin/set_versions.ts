import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SANDBOX_ROOT, runCli } from '../src/cli.ts'
import { SandboxError } from '../src/errors.ts'
import { type VersionUpdate, recordVersions } from '../src/package_versions.ts'
import { readSandboxConfig } from '../src/sandbox_config.ts'

/**
 * pnpm set-versions <package>@<version>...
 *
 * Records package releases in `config/sandbox.json` and the specification. `<package>` is the
 * package name without `@kevinjohn/adonisjs-` (`account-kit@0.3.5`). Each release's tagged
 * `package.json` supplies `builtOn.predecessorVersion` from its exact peer on the package it builds
 * on, so the sandbox records what the release was actually built against.
 */
runCli(async () => {
  const configPath = join(SANDBOX_ROOT, 'config/sandbox.json')
  const specificationPath = join(SANDBOX_ROOT, 'docs/specification.md')
  const config = readSandboxConfig(configPath)
  const args = process.argv.slice(2)
  if (args.length === 0) throw new SandboxError('Pass <package>@<version>, e.g. account-kit@0.3.5')

  const updates: VersionUpdate[] = []
  for (const arg of args) {
    const match = /^([a-z-]+)@(\d+\.\d+\.\d+)$/.exec(arg)
    if (!match) throw new SandboxError(`Expected <package>@<version>, got ${arg}`)
    const name = `@kevinjohn/adonisjs-${match[1]}`
    const entry = config.packages.find((candidate) => candidate.name === name)
    if (!entry) throw new SandboxError(`${name} is not in the sandbox`)

    const url = `https://raw.githubusercontent.com/${entry.repository}/v${match[2]}/package.json`
    const response = await fetch(url)
    if (!response.ok) throw new SandboxError(`No release tag v${match[2]} for ${name} (${url})`)
    const manifest = (await response.json()) as {
      version?: string
      peerDependencies?: Record<string, string>
    }
    if (manifest.version !== match[2])
      throw new SandboxError(`${name} v${match[2]} has package.json version ${manifest.version}`)

    let predecessorVersion: string | null = null
    if (entry.buildsOn) {
      predecessorVersion = manifest.peerDependencies?.[entry.buildsOn] ?? null
      if (!predecessorVersion || !/^\d+\.\d+\.\d+$/.test(predecessorVersion))
        throw new SandboxError(`${name} v${match[2]} does not pin ${entry.buildsOn} exactly`)
    }
    updates.push({ name, version: match[2], predecessorVersion })
  }

  const recorded = recordVersions(
    readFileSync(configPath, 'utf8'),
    readFileSync(specificationPath, 'utf8'),
    updates
  )
  writeFileSync(configPath, recorded.config)
  writeFileSync(specificationPath, recorded.specification)

  for (const update of updates) {
    const built = update.predecessorVersion ? ` (built on ${update.predecessorVersion})` : ''
    console.log(`${update.name} ${update.version}${built}`)
  }
  console.log(
    '\nNext: pnpm assemble, then pnpm resolve --kit <kit> --prune-unused for each kit,' +
      ' pnpm assemble --check and pnpm test:app --kit <kit>.'
  )
  return true
})
