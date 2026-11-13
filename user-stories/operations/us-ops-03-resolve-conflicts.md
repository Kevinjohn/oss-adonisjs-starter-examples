# US-OPS-03 — Resolve a pending assembly conflict

As a sandbox maintainer, I want to record edited conflict results for their exact input blobs so that future assembly can reuse the reviewed resolution.

**Status:** Operator; source-reviewed availability, not runtime-tested.
**Access:** Sandbox maintainer with the selected kit sources, supported Node 24/pnpm toolchain and filesystem access.
**Entry:** `pnpm resolve --kit <kit> [--pending <dir>] [--delete <path>]... [--prune-unused]`.
**Documentation:** [Repository instructions](../../docs/specification.md).
**Source:** [Resolve CLI](../../bin/resolve.ts).

## Acceptance criteria

| Option           | Type          | Required/default/conditions                                                                                         |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--kit`          | String        | Required; configured kit                                                                                            |
| `--pending`      | Directory     | Defaults to `tmp/conflicts`; resolved folder must be inside repository `tmp/`                                       |
| `--delete`       | Repeated path | Optional; each path must identify a pending conflict and records intentional deletion                               |
| `--prune-unused` | Boolean       | Defaults false; requires the default pending location and merges released sources before pruning unused resolutions |

- Edit pending result files before invoking the command. Missing content, remaining conflict markers or a non-object `package.json` result reject validation before any pending result is saved.
- `resolvePendingConflicts` records content/deletion beside base/ours/theirs blob and mode inputs, retaining alternative resolutions for different inputs. Successfully saved pending files are removed.
- Optional unused pruning runs after saves; if its released merge fails it reports nothing pruned and exits nonzero, while already saved resolutions remain.
- Rerun assembly to establish that the intended resolution matches and the resulting app is usable; saving a resolution alone does not test the app.

## User flow

```mermaid
flowchart TD
    A["Edit pending content or choose deliberate deletion"] --> B["Run resolve for selected kit"]
    B --> C{"Pending results valid?"}
    C -->|No| D["Correct missing files, markers or JSON"]
    C -->|Yes| E["Save results tied to exact inputs"]
    E --> F{"Prune unused requested?"}
    F -->|No| G["Rerun assembly with saved resolutions"]
    F -->|Yes| H["Merge released inputs and prune only if merge succeeds"]
    H --> G
```

## Code flow

Scope: Sandbox CLI through its implementation; generated application behavior is outside this operation.

```mermaid
flowchart TD
    A["bin/resolve.ts runCli callback"] --> B["readSandboxConfig and resolveOutDirectory"]
    B --> C["refusePruneWithLocalPending when requested"]
    C --> D["resolvePendingConflicts validates all pending entries"]
    D --> E["Write input/result records; remove saved pending entries"]
    E --> F["Optional pruneUnusedResolutions uses mergeKit and ResolutionStore"]
    F --> G["runCli reports status"]
```

**Code references:** [Resolve CLI](../../bin/resolve.ts), [resolvePendingConflicts and ResolutionStore](../../src/resolutions.ts), [Pruning helpers](../../src/resolve_command.ts), [Resolution tests](../../tests/tooling/merge.spec.ts).
