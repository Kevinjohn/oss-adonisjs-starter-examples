# Agent instructions

## Versions

Node 24 (`.nvmrc`) and pnpm 11.23.0 (`packageManager`) for every command. Run `nvm use` first.

## Scripts

- `pnpm assemble [--kit <kit>]...` assembles each kit's app into `apps/<kit>/` from the base kit
  and the package examples listed in `config/sandbox.json`.
- `pnpm assemble --check` assembles into `tmp/` and compares with `apps/`; exits 1 on any
  difference or unused resolution. Writes nothing outside `tmp/`.
- `pnpm assemble --kit <kit> --with-local <package root> --out tmp/<dir>` replaces one package
  with a local working copy, packed into the app's `vendor/`. `--out` must be inside `tmp/`.
- `pnpm resolve --kit <kit> [--pending <dir>] [--delete <path>]... [--prune-unused]` saves edited
  pending conflicts from `tmp/conflicts/` (or `<out>/conflicts/` after a `--with-local` run) into
  `resolutions/`, and optionally deletes resolutions no conflict used. `--prune-unused` merges the
  released packages, so it refuses a `--pending` folder other than `tmp/conflicts`.
- `pnpm test:app --kit <kit> [--dir apps] [--install-browsers]` installs, checks and tests one app
  in a copy under `tmp/test-app/`.
- `pnpm test` runs the Japa specs in `tests/tooling/`.
- `pnpm lint`, `pnpm typecheck`, `pnpm format`, `pnpm format:check`.
- `pnpm check` runs formatting, lint, types and tests.

## Layout

```
config/sandbox.json            packages, versions, kit folders, provenance
templates/app_readme.md        README written into each assembled app
resolutions/<kit>/<short>/     recorded conflict results (written by pnpm resolve)
layers/combined/<kit>/         sandbox-owned files copied into an app
apps/<kit>/                    assembled apps (written by pnpm assemble)
bin/                           assemble.ts, resolve.ts, test_app.ts, test.ts
src/                           one responsibility per file
tests/tooling/                 one spec per module
tests/helpers/                 local fixture repositories and a fake command runner
docs/specification.md          file formats and the assembly algorithm
```

## Rules

- Never hand-edit `apps/`; run `pnpm assemble`. Commit `apps/<kit>/` with `git add -f`, because an
  app's own `.gitignore` can match files it tracks.
- Never hand-edit `resolutions/`; run `pnpm resolve`.
- One responsibility per file, named for it.
- Japa only, one config, every spec in `tests/tooling/`.
- Tests never contact GitHub; they use local bare repositories from `tests/helpers/`.
- Read `docs/specification.md` before changing assembly.
