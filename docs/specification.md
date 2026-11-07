# Assembly specification

Sections 5 and 6 of the starter examples plan (2026-11-07), verbatim.

## 5. File formats

### 5.1 Sandbox config: `config/sandbox.json`

At the end of Phase 2:

```json
{
  "schemaVersion": 1,
  "base": {
    "repository": "adonisjs/starter-kits",
    "commit": "46d235932e3eb6472a16b740fa0b47b5f69fc6fc"
  },
  "kits": ["api", "hypermedia", "inertia-react"],
  "packages": [
    {
      "name": "@kevinjohn/adonisjs-account-kit",
      "repository": "Kevinjohn/oss-adonisjs-account-kit",
      "version": "0.3.1",
      "buildsOn": null,
      "builtOn": {
        "base": "46d235932e3eb6472a16b740fa0b47b5f69fc6fc",
        "predecessorVersion": null
      },
      "kits": {
        "api": "examples/api",
        "hypermedia": "examples/hypermedia",
        "inertia-react": "examples/inertia-react"
      },
      "exclude": ["compatibility/"]
    }
  ]
}
```

`builtOn` records what the example at `version` was copied from. Change it only in the same PR
that moves `version` to a release whose examples were re-copied or rebased onto the new
predecessor (runbooks 16.1 and 16.5).

Validation. Before any fetch or write. Each rule fails with the quoted message.

| Rule                                                                                                                  | Message                                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `schemaVersion` is `1`                                                                                                | `Unsupported schemaVersion <v>`                                                                   |
| `base.repository` is `adonisjs/starter-kits`; `base.commit` and every `builtOn.base` are 40 lowercase hex characters  | `Invalid base`                                                                                    |
| `kits` is a non-empty list of unique values from `api`, `hypermedia`, `inertia-react`                                 | `Invalid kits`                                                                                    |
| `packages` is non-empty; `name` unique, starts with `@kevinjohn/adonisjs-`                                            | `Invalid package name <n>`                                                                        |
| `repository` matches `Kevinjohn/oss-adonisjs-[a-z-]+`                                                                 | `Invalid repository <r>`                                                                          |
| `version` and a non-null `builtOn.predecessorVersion` match `^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$`                       | `Invalid version <v>`                                                                             |
| `buildsOn` is `null` or a package earlier in the list                                                                 | `<p> builds on <d>, which must come earlier`                                                      |
| `builtOn.predecessorVersion` is `null` exactly when `buildsOn` is `null`                                              | `<p> builtOn does not match buildsOn`                                                             |
| `builtOn.base` equals `base.commit` (D10)                                                                             | `<p> examples were copied from base <a>; the sandbox uses <b>. Rebase them (16.1).`               |
| `builtOn.predecessorVersion` equals the sandbox version of `buildsOn` (D10)                                           | `<p> examples were copied from <d>@<a>; the sandbox uses <d>@<b>. Re-copy or rebase them (16.5).` |
| `kits` keys are in the top-level `kits`; values are relative paths with no `..` segment, no leading `/`, no backslash | `Invalid kit path <path>`                                                                         |
| a package's kit also exists in its `buildsOn` package                                                                 | `<p> has <kit> but <d> does not`                                                                  |
| `exclude` entries follow the same path rules; a trailing `/` means a directory                                        | `Invalid exclude <e>`                                                                             |

Checks against the fetched source (6.3): the root `package.json` `name` at the tag equals `name`
(`<repository>@v<version> is <other name>`); each kit path contains `package.json` and
`adonisrc.ts` (`<p> <kit> path <path> is not an AdonisJS app`).

A package without a kit is skipped for that kit, and that kit's app must not depend on it.

### 5.2 Generated and runtime files

| Path                                                                                | Treatment                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm-lock.yaml`                                                                    | Removed from every tree before committing. Seeded and regenerated (6.6).                                                                                                                                                                                                                                                    |
| `database/schema.ts`, `.adonisjs/`                                                  | Kept in trees (models import `#database/schema`, so the app needs it to boot). Conflicts resolve to "ours". Regenerated after merging (6.6).                                                                                                                                                                                |
| `README.md` at the app root                                                         | Removed from every tree before committing. Written once after merging (6.3).                                                                                                                                                                                                                                                |
| `.env`, `tmp/` contents except `tmp/.gitkeep`, `node_modules/`, `build/`, `vendor/` | Runtime files. `tmp/.gitkeep` is ordinary source: every kit tracks it, and SQLite writes `tmp/db.sqlite3` there. Created during regeneration or tests, never part of a tree or of output (except `vendor/` in `--with-local` and main-mode output). If present in a source tree, fail with `Unexpected <path> in <source>`. |

### 5.3 Resolutions

For a conflict on `app/models/user.ts` while merging Lucid Soft Delete into `inertia-react`:

```
resolutions/inertia-react/lucid-soft-delete/app/models/user.ts             resolved content
resolutions/inertia-react/lucid-soft-delete/app/models/user.ts.inputs.json inputs and result
```

`.inputs.json` in `resolutions/`:

```json
{
  "path": "app/models/user.ts",
  "base": { "blob": "<sha>", "mode": "100644" },
  "ours": { "blob": "<sha>", "mode": "100644" },
  "theirs": null,
  "result": "content"
}
```

- Each side is `null` when the file does not exist on that side.
- `result` is `"content"` (use the content file) or `"delete"` (no content file exists). Pending
  files have `"result": null`; only `pnpm resolve` sets it.
- A resolution applies only when path, existence, blob and mode match on all three sides.
- `resolutions/` is excluded from the sandbox's own lint, format and typecheck.

---

## 6. How assembly works

The specification for Phase 1. Released mode only; main mode is Phase 7.

### 6.1 Overview

For each kit, in a fresh scratch git repository:

```
B ── AK                 Account Kit example, parent B
      ├── M             Masquerade example, parent AK
      └── C             Access Control example, parent AK
B ── S                  Soft Delete example, parent B

app = B
merge AK into app       (merge commit; no conflicts possible)
merge M into app        (merge commit; no conflicts possible)
merge C into app        (real merge, merge base AK)
merge S into app        (real merge, merge base B)
normalise, overlay, regenerate
```

### 6.2 Reading trees and files

- **Base.** Cache at `tmp/cache/repos/adonisjs__starter-kits.git`, created with
  `git init --bare` and `git remote add origin https://github.com/adonisjs/starter-kits.git`.
  Then `git fetch --depth=1 origin <commit>` and
  `git archive --format=tar <commit>:<kit> | tar -x -C <empty dir>`.
- **Package at a tag.** Same cache pattern per repository, then
  `git fetch --depth=1 origin refs/tags/v<version>:refs/tags/v<version>` and
  `git archive --format=tar v<version>:<kit path>`.
- **One file at a tag.** `git show v<version>:package.json`,
  `git show v<version>:<kit path>/pnpm-lock.yaml` (`git archive` does not work for a single file).
- **Local package** (`--with-local`, 6.8). List files with
  `git -C <root> ls-files -co --exclude-standard -z -- <kit path>`, skip paths that no longer
  exist, copy the rest preserving the executable bit.
- **Filter.** Remove `pnpm-lock.yaml`, the root `README.md`, and the package's `exclude` entries.
  Fail on runtime files (5.2) and on any symlink: `Symlinks are not supported: <path> in <source>`.
- Every function that contacts a remote takes `remoteUrlFor(repository)`; tests pass local paths.
- Resolve every path argument to an absolute path at the start of the command.

### 6.3 Building commits and merging

Run git with this environment and these options so results do not depend on the machine:

```
GIT_CONFIG_NOSYSTEM=1  GIT_CONFIG_GLOBAL=/dev/null
GIT_AUTHOR_NAME=starter-examples  GIT_AUTHOR_EMAIL=starter-examples@invalid
GIT_COMMITTER_NAME=starter-examples  GIT_COMMITTER_EMAIL=starter-examples@invalid
GIT_AUTHOR_DATE=2000-01-01T00:00:00Z  GIT_COMMITTER_DATE=2000-01-01T00:00:00Z
git -c core.autocrlf=false -c core.filemode=true -c commit.gpgsign=false
    -c rerere.enabled=false -c core.hooksPath=/dev/null -c core.excludesFile=/dev/null
    -c merge.conflictStyle=diff3 ...
```

After `git init`, write `* -text` to `.git/info/attributes`.

**Commit a tree on a parent:**

- For `B`: `git switch -q --orphan base`.
- For any other: `git switch -q -C <label> <parent commit>`.
- Then `git rm -rq --ignore-unmatch -- .`, `git clean -fdxq`, copy the filtered files in,
  `git add -A -f`, `git commit -q --allow-empty -m "<label>"`. Labels: `base`,
  `<short name>@<version>`.

**Lineage, per kit:**

1. Validate the config (5.1), including D10.
2. Commit `B`.
3. For each package `P` in config order that has this kit:
   1. Read `P`'s root `package.json` at the tag (6.2). Check its `name` (5.1). If `P.buildsOn` is
      `D`: `peerDependencies[D]` must equal the sandbox version of `D`, else fail with
      `<P>@<v> peers on <D> <range>; the sandbox uses <D>@<w>`.
   2. Read the kit tree; check it is an AdonisJS app (5.1).
   3. Parent is `B` when `buildsOn` is `null`, else the commit built for `D` in this run.
   4. Commit `P`'s filtered example on that parent.
   5. Migration check (6.7) against the parent's tree.

**Merging:**

1. `git switch -q -C app <B>`.
2. For each package commit in config order:
   1. `git merge --no-ff --no-commit -X no-renames <commit>`. Exit 0, or exit 1 with
      `.git/MERGE_HEAD` present, is expected; anything else throws with git's output.
   2. Run 6.4.
   3. If any path is unresolved: `git merge --abort`, print the report (6.5), exit 1.
   4. Otherwise check `git diff --name-only --diff-filter=U` is empty and that the work tree
      matches the index (`git diff --quiet`), then `git commit -q --no-edit -m "merge <label>"`.

**After merging:**

1. Normalise `package.json`: set `name` to `adonisjs-starter-examples-<kit>`; delete
   `scripts["kit:pack"]`; in `dependencies`, `devDependencies` and `optionalDependencies`, set
   every `@kevinjohn/*` key to the release URL of the sandbox version (or the `--with-local`
   specifier, 6.8). Fail with `<kit> app depends on <pkg>, which is not in the sandbox for this kit`
   if that package is not merged into this kit. Leave `peerDependencies` alone. Sort the four
   dependency maps and serialise with `JSON.stringify(value, null, 2) + '\n'`.
2. Write `README.md` from `templates/app_readme.md` with `{{kit}}`, `{{baseCommit}}` and
   `{{packagesTable}}` (package, version, link to its example folder at the tag).
3. Copy `layers/combined/<kit>/` if it exists. Fail on any existing path:
   `Overlay file <path> already exists in <kit>`.
4. `git add -A -f` and commit `normalise`.

### 6.4 Merge steps

**Step 1: `package.json`, always first.** Read its three versions:
`git show $(git merge-base HEAD MERGE_HEAD):package.json`, `git show HEAD:package.json`,
`git show MERGE_HEAD:package.json` (each may be missing). Run the structural merge below.

- No conflicts: write the result, `git add package.json`. Done with this path.
- Conflicts: use a recorded resolution if one matches (step 4), else write a pending conflict
  containing the three versions and the conflicting key paths (step 5).

`package.json` is then excluded from steps 2 to 5.

**Structural merge.** Inputs `O` (base), `A` (ours), `B` (theirs); a missing value is different
from `null`. For each object key, in the order keys of `A`, then new keys of `B`, then keys only
in `O`:

- `a` equals `b` (deep): keep `a` (missing stays missing).
- `a` equals `o`: take `b` (missing deletes the key).
- `b` equals `o`: keep `a`.
- `a` and `b` are plain objects and `o` is a plain object or missing: recurse.
- The key path is `name`, `scripts.kit:pack`, or `dependencies|devDependencies|optionalDependencies`
  followed by an `@kevinjohn/*` key: keep `a` (normalised later).
- Otherwise: conflict at that key path.

Arrays and other values are compared whole. Duplicate keys inside a package's own input
`package.json` are not detected (out of scope; the output cannot contain duplicates).

**Steps 2 to 5, for every other conflicted path.** List paths and stages with `git ls-files -u -z`
(stage 1 base, 2 ours, 3 theirs; a missing stage means the file does not exist on that side).

2. **Unsupported (D8).** Fail if a present stage contains a NUL byte, present stages' modes
   differ, a stage has mode `120000`, or `git status --porcelain=v1` shows a code other than `UU`,
   `AA`, `UD` or `DU` for the path:
   `Unsupported conflict (<code or reason>) on <path> while merging <label>. Change the package example so it does not conflict, then run again.`
3. **Generated** (`database/schema.ts`, anything under `.adonisjs/`): take stage 2 if present,
   else stage 3, and `git add` it.
4. **Recorded resolution** matching all three inputs (5.3): write the content and `git add` it, or
   `git rm` the path for `"delete"`.
5. **Pending.** Run `git merge-file -p --diff3 -L ours -L base -L theirs <ours> <base> <theirs>`
   on temporary copies (an empty file for a missing stage). Write the output and an inputs file
   with `"result": null` to the pending folder (D14). Mark the path unresolved.

### 6.5 Resolving conflicts

When assembly stops it prints:

```
Merging <label> into <kit> left <n> conflict(s):
  tmp/conflicts/<kit>/<short>/<path>
Edit each file to the merged content and remove every conflict marker. Then run
  pnpm resolve --kit <kit>
and add --delete <path> for a file that should not exist. Then run pnpm assemble again.
```

`pnpm resolve --kit <kit> [--delete <path>]... [--prune-unused]` (`bin/resolve.ts`):

1. Validate every pending file first: for a path not listed in `--delete`, the content file
   exists and has no line starting `<<<<<<<`, `|||||||`, `=======` or `>>>>>>>`; for
   `package.json`, it also parses as a JSON object. If any check fails, copy nothing and exit 1.
2. Set `result` to `"delete"` for listed paths and `"content"` for the rest.
3. Write the inputs file and, for `"content"`, the content file into `resolutions/`. When
   replacing an older resolution, delete its old content file if the new result is `"delete"`.
4. Delete the pending files.
5. With `--prune-unused`: run assembly for the kit. If any merge stops or fails, delete nothing
   and exit 1. Otherwise delete each resolution under `resolutions/<kit>/` that no conflict in
   that run matched, and print each deleted path. Refuse `--prune-unused` with a `--pending`
   folder other than `tmp/conflicts`: it merges the released packages, so it would delete
   resolutions just saved from a `--with-local` run.

Unused resolutions for the selected kits are warnings in `assemble` (with the hint
`pnpm resolve --kit <kit> --prune-unused`) and errors in `assemble --check`.

### 6.6 Regenerating and output

Extract the final commit with `git archive app | tar -x -C <T>` (keeps modes), then
`git init -q <T>` with the isolated configuration of 6.3, so ignore rules come only from the app.
Seed the lockfile: `apps/<kit>/pnpm-lock.yaml` if it exists, otherwise the `pnpm-lock.yaml` of the
last merged package's example at its tag (6.2). For `--with-local`, copy the archive into
`<T>/vendor/` now (6.8).

In `<T>`, with a constructed environment (`PATH`, `HOME`, `HOST=127.0.0.1`,
`LIMITER_STORE=memory`, `CI`, `PNPM_HOME` and `XDG_*_HOME` when set, and no variable starting
with `ACCOUNT_KIT_`):

```
pnpm install --no-frozen-lockfile        (assemble, --with-local, main)
pnpm install --frozen-lockfile           (check)
cp .env.example .env
pnpm exec node ace generate:key --force
pnpm exec node ace codegen
pnpm exec node ace migration:run --force
```

Before the commands, snapshot every path in the final commit that is not generated. Afterwards:

- restore `.env.example` if it changed, and log `restored .env.example`;
- fail, listing the paths, if any other snapshot path changed or disappeared, or if any new path
  appeared outside generated paths and runtime files (5.2).

When a command fails, report the command and its full output. Clean up in a `finally` block.

**Output set:**

1. every non-generated path in the final commit, with its bytes and mode from `<T>`;
2. `pnpm-lock.yaml` from `<T>`;
3. `database/schema.ts` and every file under `.adonisjs/` in `<T>`, unless
   `git -C <T> check-ignore -q <path>` says the app ignores it;
4. `vendor/` only for `--with-local` and main mode.

**Assemble** replaces `apps/<kit>/` with the output set. **Check** compares the output set with
`apps/<kit>/` (path, mode and bytes), prints `added`, `removed` or `changed` per path, and exits 1
on any difference. Check never writes outside `tmp/`.

### 6.7 Migration check

For package `P` with parent tree `Q` (the base for `buildsOn: null`): `max(Q)` is the largest
numeric prefix in `Q`'s `database/migrations/`, or 0 if there are none. Every migration `P` adds
must have a larger prefix:

```
<P> adds database/migrations/<file> (<kit>), which sorts before <Q's last migration>.
Rename it to a prefix above <max(Q)> before it is first run (runbook 16.4).
```

Packages on the same predecessor may use equal prefixes; Lucid then orders them by full file
name. Ordering inside the combined app is proven by `migration:run` on a fresh database in 6.6.

### 6.8 `--with-local`

`pnpm assemble --with-local <root> --out <dir>` replaces one package with a local checkout. Used by
package CI.

- The package is the one whose `name` equals `<root>/package.json` `name`. If the sandbox config
  does not list it: `Add <pkg> to config/sandbox.json in the sandbox first`.
- `<root>` and `<dir>` are resolved to absolute paths first. `<dir>` must resolve, after
  following symlinks, to a folder inside the sandbox's `tmp/`. Refuse anything else.
- Example trees come from the local working copy (6.2); peer and name checks use the local
  `package.json`; D10 version checks for this package use its local peer, and its `builtOn` in the
  config must still match.
- Runtime is the local code, packed once per run: `pnpm --dir <root> build`, then
  `pnpm --dir <root> pack --out <absolute tmp path>/<asset without -<version>>.tgz`. For each kit,
  copy that archive into `<T>/vendor/` before install and set this package's `@kevinjohn/*`
  specifiers to `file:vendor/<that file>`.
- Pending conflicts go under `<dir>/conflicts/`. Never compares with `apps/`.
