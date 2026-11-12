# US-MASQ-03 — Rename a team during support

As a configured support operator, I want to rename a team through an allowed target identity so that the write follows the target's actual team permission and the host's support policy.

**Status:** Current; source-reviewed, not runtime-tested here.
**Access:** Browser uses the effective session target; target needs `team:write`, active mode must be edit, and the route must allow mutations. API access-token strategy uses `api_effective` and requires current context on the unsafe request; API session strategy uses raw `web`.
**Entry:** Browser kits: `POST /teams/:scopeId`; API: `PATCH /api/v1/teams/:scopeId`.
**Documentation:** [Masquerade and team scope guide](../../docs/cookbook/masquerade-with-access-control.md#keep-team-permissions-in-force).
**Source:** [Hypermedia team routes](../../apps/hypermedia/start/routes.ts), [API team routes](../../apps/api/start/routes.ts).
**Coverage:** [Masquerade access-control tests](../../apps/api/tests/functional/masquerade_access_control.spec.ts); this link identifies source behavior coverage, not runtime verification of these docs.

## Acceptance criteria

| Field           | Control                                                             | Required/default/conditions                                                      |
| --------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Team name       | Text input / JSON string                                            | Required; trimmed; 1–100 characters.                                             |
| Support context | Browser session context / `X-Masquerade-Context` for API token mode | Current context for an unsafe request while a mode is active.                    |
| Team scope      | Route ID and server-loaded membership                               | Caller must belong to the team and have `team:write` under the applicable guard. |

- The route resolves authentication, account eligibility, and team scope before `TeamsController.update` runs. The controller authorizes `team:write`, validates the name, loads the team, and saves it.
- Browser effective identity is the target during support mode. In API token mode, the effective guard is `api_effective`; in session mode, the configured team guard is raw `web`.
- During browser or API token support, the rename succeeds only when the active mode is edit, the route has the `allowMutation()` marker, context is current, and the effective target has `team:write`. A view mode, sensitive route, stale context, absent membership, missing permission, or invalid name does not change the team.
- Browser redirects to the team page with confirmation; API returns the renamed team ID and name.

## User flow

```mermaid
flowchart TD
    A["Operator submits team name on a team route"] --> B{"Browser or API identity?"}
    B -->|Browser| C["Effective session resolves target account"]
    B -->|API access token| D["Current context and api_effective resolve target"]
    B -->|API session| E["Raw web account remains the route identity"]
    C --> F{"Scope and team:write allowed?"}
    D --> F
    E --> F
    F -->|No| G["Refuse before save"]
    F -->|Yes| H{"Support mutation allowed?"}
    H -->|No| G
    H -->|Yes| I["Validate name and save team"]
    I --> J["Redirect browser or return API team result"]
```

## Code flow

```mermaid
flowchart TD
    A["Router middleware runs masqueradeContext"] --> B["Team route authentication, eligibility, and scope middleware"]
    B --> C["Update route carries allowMutation marker"]
    C --> D["TeamsController.update"]
    D --> E["bouncer.authorize team:write"]
    E --> F["teamValidator"]
    F --> G["Team.findOrFail and team.save"]
    G --> H["Browser redirect / API response"]
```

**Code references:** [Hypermedia routes and allowMutation marker](../../apps/hypermedia/start/routes.ts), [Hypermedia context middleware](../../apps/hypermedia/app/middleware/masquerade_context_middleware.ts), [Hypermedia team controller](../../apps/hypermedia/app/controllers/teams_controller.ts), [API routes and teamGuard](../../apps/api/start/routes.ts), [API context middleware](../../apps/api/app/middleware/masquerade_context_middleware.ts), [API auth strategy](../../apps/api/app/services/auth_strategy.ts), [API team controller](../../apps/api/app/controllers/teams_controller.ts), [Masquerade access-control tests](../../apps/api/tests/functional/masquerade_access_control.spec.ts), [Inertia React route and controller](../../apps/inertia-react/start/routes.ts), [React controller](../../apps/inertia-react/app/controllers/teams_controller.ts), [Inertia Vue route and controller](../../apps/inertia-vue/start/routes.ts), [Vue controller](../../apps/inertia-vue/app/controllers/teams_controller.ts).
