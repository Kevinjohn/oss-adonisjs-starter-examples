# US-MASQ-03 — Rename a team during support

As a configured support operator, I want to rename a team through an allowed target identity so that the write follows the target's actual team permission and the host's support policy.

**Status:** Current; source-reviewed, not runtime-tested here.
**Access:** Browser uses the effective session target and report-only context enforcement; target needs `team:write`, active mode must be edit, and the route must allow mutations. API access-token strategy uses `api_effective` and enforces current context on unsafe requests; API session strategy uses raw `web`, outside effective-mode context enforcement.
**Entry:** Browser kits: `POST /teams/:scopeId`; API: `PATCH /api/v1/teams/:scopeId`.
**Documentation:** [Masquerade and team scope guide](../../docs/cookbook/masquerade-with-access-control.md#keep-team-permissions-in-force).
**Source:** [Hypermedia team routes](../../apps/hypermedia/start/routes.ts), [API team routes](../../apps/api/start/routes.ts).
**Coverage:** [Masquerade access-control tests](../../apps/api/tests/functional/masquerade_access_control.spec.ts); this link identifies source behavior coverage, not runtime verification of these docs.

## Acceptance criteria

| Field           | Control                                                 | Required/default/conditions                                                                                                            |
| --------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Team name       | Text input / JSON string                                | Required; trimmed; 1–100 characters.                                                                                                   |
| Support context | Browser session context / `X-Masquerade-Context` header | Browser reports context mismatches and continues policy checks; API access-token routes enforce current context on unsafe requests, including while idle; raw API session routes skip this effective-mode check. |
| Team scope      | Route ID and server-loaded membership                   | Caller must belong to the team and have `team:write` under the applicable guard.                                                       |

- The route resolves authentication, account eligibility, and team scope before `TeamsController.update` runs. The controller authorizes `team:write`, validates the name, loads the team, and saves it.
- Browser effective identity is the target during support mode. In API token mode, the effective guard is `api_effective`; in session mode, the configured team guard is raw `web`.
- During browser support, a context mismatch is logged in report mode and does not by itself refuse the rename; the active mode must still be edit, the route must carry `allowMutation()`, and the effective target must have `team:write`.
- API access-token team requests enforce current context on unsafe methods, including while idle; a mismatch is refused. During active token support, edit access, the route marker, and target permission are also required. API session team requests use raw `web` and skip effective-mode context and mutation checks; they still require the raw account to pass admission, scope and `team:write`. A denied mutation policy, missing permission or invalid name prevents the save.
- Browser redirects to the team page with confirmation; API returns the renamed team ID and name.

## User flow

```mermaid
flowchart TD
    A["Operator submits team name"] --> B{"Selected route guard?"}
    B -->|Browser effective session| C["Report context mismatch if present; resolve effective target"]
    B -->|API access token effective| D{"Current context valid?"}
    B -->|API raw session| E["Use raw web account; skip effective-mode checks"]
    D -->|No| F["Refuse unsafe request"]
    D -->|Yes| G["Resolve effective target"]
    C --> H{"Edit mode and mutable route allowed?"}
    G --> H
    H -->|No| F
    H -->|Yes| I["Check selected account eligibility, scope and team:write"]
    E --> I
    I --> J{"Account and permission accepted?"}
    J -->|No| F
    J -->|Yes| K["Validate name; save and return transport-specific result"]
```

## Code flow

```mermaid
flowchart TD
    A["masqueradeContext inspects selected route guard"] --> B{"Effective guard?"}
    B -->|No: API raw web| C["Skip effective-mode context and mutation policy"]
    B -->|Yes| D{"Browser report or API token enforce?"}
    D -->|Browser| E["Log any unsafe context mismatch and continue"]
    D -->|API token| F["Require current unsafe context; refuse mismatch"]
    E --> G["For active mode, enforce edit access and allowMutation marker"]
    F --> G
    C --> H["Route auth, eligibility and scope middleware"]
    G --> H
    H --> I["TeamsController.update authorizes team:write"]
    I --> J["Validate name, load team and save"]
    J --> K["Browser redirect or API response"]
```

**Code references:** [Hypermedia routes and allowMutation marker](../../apps/hypermedia/start/routes.ts), [Hypermedia Masquerade config](../../apps/hypermedia/config/masquerade.ts), [Hypermedia context middleware](../../apps/hypermedia/app/middleware/masquerade_context_middleware.ts), [Hypermedia team controller](../../apps/hypermedia/app/controllers/teams_controller.ts), [API routes and teamGuard](../../apps/api/start/routes.ts), [API Masquerade config](../../apps/api/config/masquerade.ts), [API context middleware](../../apps/api/app/middleware/masquerade_context_middleware.ts), [API auth strategy](../../apps/api/app/services/auth_strategy.ts), [API team controller](../../apps/api/app/controllers/teams_controller.ts), [Masquerade access-control tests](../../apps/api/tests/functional/masquerade_access_control.spec.ts), [Inertia React route/controller](../../apps/inertia-react/start/routes.ts), [React Masquerade config](../../apps/inertia-react/config/masquerade.ts), [React controller](../../apps/inertia-react/app/controllers/teams_controller.ts), [Inertia Vue route/controller](../../apps/inertia-vue/start/routes.ts), [Vue Masquerade config](../../apps/inertia-vue/config/masquerade.ts), [Vue controller](../../apps/inertia-vue/app/controllers/teams_controller.ts).
