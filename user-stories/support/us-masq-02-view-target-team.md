# US-MASQ-02 — View a team as the effective target

As a configured support operator, I want to inspect a team using the target account's membership so that my read access matches that account while my own credential remains unchanged.

**Status:** Current for browser sessions and the API kit's access-token strategy; API session strategy selects raw `web` for team routes.
**Access:** Masquerade mode must be admitted; target must belong to the team and pass `team:read`. API token mode also requires the `masquerade` ability. A safe GET does not require a fresh mutation context header.
**Entry:** Browser kits: open `GET /teams/:scopeId` during a mode; API access-token mode: `GET /api/v1/teams/:scopeId` through `api_effective`.
**Documentation:** [Resolve team membership for the effective account](../../docs/cookbook/masquerade-with-access-control.md#resolve-team-membership-for-the-effective-account), [API kit](../../apps/api/README.md#api).
**Source:** [Hypermedia effective guard selection](../../apps/hypermedia/config/auth.ts), [API strategy and route guard](../../apps/api/start/routes.ts), [TeamsController.show](../../apps/hypermedia/app/controllers/teams_controller.ts).
**Coverage:** [API team and Masquerade tests](../../apps/api/tests/functional/masquerade_access_control.spec.ts).

## Acceptance criteria

- There is no editable input for a team read; the team ID comes from the route and membership is loaded by route middleware.
- In Hypermedia, React and Vue, the default `web_effective` guard resolves the admitted target for covered team routes. In API token mode, `teamGuard` selects `api_effective`; if API auth strategy is `session`, `teamGuard` selects raw `web` and this API route does not act as the target.
- Scope middleware runs after auth and before `TeamsController.show`; it refuses a nonmember and attaches the member role. The controller then checks `team:read` before returning the team and member roles.
- API token requests need the `masquerade` ability. A current context token is required on unsafe covered mutations, not on this safe GET. An expired or invalidated mode refuses the triggering request; it does not retry under the operator identity or silently read as the target.

## User flow

```mermaid
flowchart TD
    A["Open a team page during an admitted mode"] --> B["Effective guard resolves target account"]
    B --> C["Scope middleware loads target membership"]
    C --> D{"Member and team:read allowed?"}
    D -->|No| E["See authorization refusal; no team details"]
    D -->|Yes| F["See target's team and member roles; operator credentials stay unchanged"]
```

## Code flow

Scope: browser effective-session guard and API token-strategy route through membership scope and team read. API session strategy uses raw `web` for this route.

```mermaid
flowchart TD
    A["teams/:scopeId route"] --> B["middleware.auth selects web_effective or configured teamGuard"]
    B --> C["Admitted target identity when effective guard is selected"]
    C --> D["middleware.scope checks membership and attaches role"]
    D --> E["TeamsController.show"]
    E --> F["bouncer.authorize team:read"]
    F --> G["Team.findOrFail and memberships.listForScope"]
    G --> H["Render team and member roles"]
```

**Code references:** [Hypermedia route](../../apps/hypermedia/start/routes.ts), [Hypermedia auth config](../../apps/hypermedia/config/auth.ts), [API route and `teamGuard`](../../apps/api/start/routes.ts), [API auth config](../../apps/api/config/auth.ts), [team controller](../../apps/hypermedia/app/controllers/teams_controller.ts), [Access Control config](../../apps/hypermedia/config/access_control.ts), [API tests](../../apps/api/tests/functional/masquerade_access_control.spec.ts), [React route](../../apps/inertia-react/start/routes.ts), [Vue route](../../apps/inertia-vue/start/routes.ts).
