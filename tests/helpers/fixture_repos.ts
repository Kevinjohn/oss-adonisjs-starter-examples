import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Git, initRepository } from '../../src/git.ts'
import type { SandboxConfig } from '../../src/sandbox_config.ts'

/**
 * File contents for a fixture commit. `null` deletes the file; `{ executable: true }` sets mode
 * 0755; `{ symlink }` creates a symlink.
 */
export type FileSpec = Record<
  string,
  string | Buffer | null | { content: string | Buffer; executable: true } | { symlink: string }
>

export function writeFiles(directory: string, files: FileSpec): void {
  for (const [path, spec] of Object.entries(files)) {
    const target = join(directory, path)
    rmSync(target, { force: true, recursive: true })
    if (spec === null) continue
    mkdirSync(dirname(target), { recursive: true })
    if (typeof spec === 'string' || Buffer.isBuffer(spec)) {
      writeFileSync(target, spec)
      chmodSync(target, 0o644)
    } else if ('symlink' in spec) {
      symlinkSync(spec.symlink, target)
    } else {
      writeFileSync(target, spec.content)
      chmodSync(target, 0o755)
    }
  }
}

/** A fresh temporary folder, resolved through symlinks. */
export function temporaryDirectory(prefix = 'sandbox-test-'): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)))
}

/** The files of a tiny AdonisJS-shaped kit. */
export function kitFiles(kit: string): FileSpec {
  return {
    'package.json': `${JSON.stringify(
      {
        name: kit,
        private: true,
        type: 'module',
        scripts: { test: 'node ace test' },
        dependencies: { '@adonisjs/core': '^7.0.0' },
      },
      null,
      2
    )}\n`,
    'adonisrc.ts': 'export default {}\n',
    'pnpm-workspace.yaml': 'allowBuilds: {}\n',
    'start/routes.ts':
      "import router from '@adonisjs/core/services/router'\n\nrouter.get('/', () => 'ok')\n",
    'database/migrations/1000_create_users_table.ts': 'export default class {}\n',
    'database/schema.ts': 'export class UserSchema {}\n',
    'tmp/.gitkeep': '',
    '.gitignore': 'node_modules\n.env\ntmp/*\n!tmp/.gitkeep\n',
    'README.md': `# ${kit}\n`,
    'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
    'bin/server.ts': { content: '#!/usr/bin/env node\n', executable: true },
  }
}

/**
 * Local stand-ins for GitHub repositories: a working copy per repository under `work/`, pushed to
 * a bare repository under `remotes/` after every change.
 */
export class FixtureWorld {
  readonly directory = temporaryDirectory()
  readonly sandboxRoot = join(this.directory, 'sandbox')

  constructor() {
    mkdirSync(join(this.sandboxRoot, 'tmp'), { recursive: true })
  }

  remotePath(repository: string): string {
    return join(this.directory, 'remotes', `${repository.replace('/', '__')}.git`)
  }

  remoteUrlFor = (repository: string): string => `file://${this.remotePath(repository)}`

  workPath(repository: string): string {
    return join(this.directory, 'work', repository.replace('/', '__'))
  }

  workRepository(repository: string): Git {
    const path = this.workPath(repository)
    if (existsSync(join(path, '.git'))) return new Git(path)
    initRepository(this.remotePath(repository), { bare: true })
    return initRepository(path)
  }

  /** Writes the files, commits everything and pushes. Returns the commit id. */
  commit(repository: string, files: FileSpec, message = 'change'): string {
    const git = this.workRepository(repository)
    writeFiles(this.workPath(repository), files)
    git.run(['add', '-A', '-f'])
    git.run(['commit', '-q', '--allow-empty', '-m', message])
    this.push(repository)
    return git.text(['rev-parse', 'HEAD'])
  }

  tag(repository: string, tag: string): void {
    this.workRepository(repository).run(['tag', '-f', tag])
    this.push(repository)
  }

  private push(repository: string): void {
    this.workRepository(repository).run([
      'push',
      '-q',
      '--force',
      '--mirror',
      this.remotePath(repository),
    ])
  }

  /** Publishes `files` for each kit at the top level of `adonisjs/starter-kits`. */
  publishBase(kits: Record<string, FileSpec>): string {
    const files: FileSpec = {}
    for (const [kit, kitSpec] of Object.entries(kits)) {
      for (const [path, spec] of Object.entries(kitSpec)) files[`${kit}/${path}`] = spec
    }
    return this.commit('adonisjs/starter-kits', files, 'base')
  }

  /**
   * Publishes a package release: a root `package.json` and one example folder per kit, tagged
   * `v<version>`.
   */
  publishPackage(options: {
    name: string
    repository: string
    version: string
    peerDependencies?: Record<string, string>
    examples: Record<string, { path: string; files: FileSpec }>
    extra?: FileSpec
  }): string {
    const files: FileSpec = {
      'package.json': `${JSON.stringify(
        {
          name: options.name,
          version: options.version,
          peerDependencies: options.peerDependencies ?? {},
        },
        null,
        2
      )}\n`,
      ...options.extra,
    }
    for (const example of Object.values(options.examples)) {
      for (const [path, spec] of Object.entries(example.files))
        files[`${example.path}/${path}`] = spec
    }
    const commit = this.commit(options.repository, files, `release ${options.version}`)
    this.tag(options.repository, `v${options.version}`)
    return commit
  }

  cleanup(): void {
    rmSync(this.directory, { recursive: true, force: true })
  }
}

/** A valid config with Account Kit only, on the given base commit. */
export function accountKitConfig(
  baseCommit: string,
  overrides: Partial<SandboxConfig> = {}
): SandboxConfig {
  return {
    schemaVersion: 1,
    base: { repository: 'adonisjs/starter-kits', commit: baseCommit },
    kits: ['api', 'hypermedia', 'inertia-react'],
    packages: [
      {
        name: '@kevinjohn/adonisjs-account-kit',
        repository: 'Kevinjohn/oss-adonisjs-account-kit',
        version: '0.3.1',
        buildsOn: null,
        builtOn: { base: baseCommit, predecessorVersion: null },
        kits: {
          'api': 'examples/api',
          'hypermedia': 'examples/hypermedia',
          'inertia-react': 'examples/inertia-react',
        },
        exclude: ['compatibility/'],
      },
    ],
    ...overrides,
  }
}
