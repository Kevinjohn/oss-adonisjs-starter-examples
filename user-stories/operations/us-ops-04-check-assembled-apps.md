# US-OPS-04 — Check committed apps match assembly

As a sandbox maintainer, I want to compare regenerated kits with committed apps so that I can detect drift without replacing those app trees.

**Status:** Operator; source-reviewed availability, not runtime-tested.
**Access:** Sandbox maintainer with the selected kit sources, supported Node 24/pnpm toolchain and filesystem access.
**Entry:** `pnpm assemble --check [--kit <kit>]...`.
**Documentation:** [Repository instructions](../../docs/specification.md).
**Source:** [Assembly CLI](../../bin/assemble.ts).

## Acceptance criteria

- With no `--kit`, check all configured kits; repeated `--kit` selects a subset. Source configuration and network/cache prerequisites are the same as released assembly.
- Check mode cannot combine with `--with-local` or main mode. It regenerates into scratch output, uses the existing lockfile frozen, and compares output paths, bytes and modes with `apps/<kit>`.
- Differences or unused resolutions make the result nonzero; applicable alternative-version resolutions are noted separately. Committed app trees are not replaced by this command.
- Each selected kit is attempted. A clean comparison establishes source/output parity, not successful runtime journeys.

## User flow

```mermaid
flowchart TD
    A["Run assemble --check for selected kits"] --> B["Rebuild into scratch output"]
    B --> C{"Drift, merge failure or unused resolution?"}
    C -->|Yes| D["Read affected paths; correct sources or regenerate separately"]
    C -->|No| E["Receive clean parity result; committed apps remain unchanged"]
```

## Code flow

Scope: Sandbox CLI through its implementation; generated application behavior is outside this operation.

```mermaid
flowchart TD
    A["bin/assemble.ts selects check mode"] --> B["runAssembly then assembleKit"]
    B --> C["mergeKit, normaliseApp and regenerateApp"]
    C --> D["ResolutionStore unused checks and compareOutput"]
    D --> E["Log differences and return kit status"]
    E --> F["runCli sets aggregate exit code; scratch cleaned"]
```

**Code references:** [Assembly CLI](../../bin/assemble.ts), [Check path](../../src/assembly.ts), [compareOutput](../../src/compare.ts), [Assembly tests](../../tests/tooling/assembly.spec.ts).
