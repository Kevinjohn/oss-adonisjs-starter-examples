import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SandboxError } from './errors.ts'
import { listFiles } from './file_tree.ts'
import { serialisePackageJson } from './package_json_merge.ts'
import { isRuntimePath } from './tree_filter.ts'

const DEPENDENCY_MAPS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]
const INSTALL_MAPS = ['dependencies', 'devDependencies', 'optionalDependencies']

function sortKeys(map: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/**
 * Specification 6.3, after merging, step 1. `specifiers` maps each of our packages merged into
 * this kit to its install specifier (release URL, or `file:vendor/...` for a local package).
 */
export function normalisePackageJson(
  manifest: Record<string, any>,
  kit: string,
  specifiers: Map<string, string>
): Record<string, any> {
  const result: Record<string, any> = { ...manifest, name: `adonisjs-starter-examples-${kit}` }
  if (result.scripts) {
    result.scripts = { ...result.scripts }
    delete result.scripts['kit:pack']
  }
  for (const map of INSTALL_MAPS) {
    if (!result[map]) continue
    result[map] = { ...result[map] }
    for (const name of Object.keys(result[map])) {
      if (!name.startsWith('@kevinjohn/')) continue
      const specifier = specifiers.get(name)
      if (!specifier) {
        throw new SandboxError(
          `${kit} app depends on ${name}, which is not in the sandbox for this kit`
        )
      }
      result[map][name] = specifier
    }
  }
  for (const map of DEPENDENCY_MAPS) {
    if (result[map]) result[map] = sortKeys(result[map])
  }
  return result
}

export interface ReadmePackage {
  name: string
  version: string
  /** Link to the example folder at the release tag. */
  url: string
}

/**
 * A Markdown table padded the way Prettier formats one, so the generated README passes each
 * app's own `format:check`.
 */
function markdownTable(header: string[], rows: string[][]): string {
  const widths = header.map((cell, column) =>
    Math.max(cell.length, 3, ...rows.map((row) => row[column].length))
  )
  const line = (cells: string[]) =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`
  return [line(header), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join(
    '\n'
  )
}

/**
 * Specification 6.3, after merging, step 2: fills `templates/app_readme.md`.
 */
export function renderAppReadme(
  template: string,
  values: { kit: string; baseCommit: string; packages: ReadmePackage[] }
): string {
  const table = markdownTable(
    ['Package', 'Version', 'Example'],
    values.packages.map((pkg) => [`\`${pkg.name}\``, pkg.version, `[example](${pkg.url})`])
  )
  return template
    .replaceAll('{{kit}}', values.kit)
    .replaceAll('{{baseCommit}}', values.baseCommit)
    .replaceAll('{{packagesTable}}', table)
}

/**
 * Specification 6.3, after merging, step 3: copies `layers/combined/<kit>/` into the app, failing
 * on any path that already exists.
 */
export function copyOverlay(overlay: string, appDirectory: string, kit: string): void {
  if (!existsSync(overlay)) return
  for (const entry of listFiles(overlay)) {
    if (
      entry.kind === 'symlink' ||
      isRuntimePath(entry.path) ||
      entry.path.split('/').includes('node_modules')
    ) {
      throw new SandboxError(`Unexpected ${entry.path} in the ${kit} overlay`)
    }
    if (existsSync(join(appDirectory, entry.path))) {
      throw new SandboxError(`Overlay file ${entry.path} already exists in ${kit}`)
    }
  }
  cpSync(overlay, appDirectory, { recursive: true, verbatimSymlinks: true })
}

/**
 * Applies steps 1 to 3 to an app's work tree.
 */
export function normaliseApp(options: {
  appDirectory: string
  kit: string
  specifiers: Map<string, string>
  readme: string
  overlay: string
}): void {
  const manifestPath = join(options.appDirectory, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  writeFileSync(
    manifestPath,
    serialisePackageJson(normalisePackageJson(manifest, options.kit, options.specifiers))
  )
  writeFileSync(join(options.appDirectory, 'README.md'), options.readme)
  copyOverlay(options.overlay, options.appDirectory, options.kit)
}
