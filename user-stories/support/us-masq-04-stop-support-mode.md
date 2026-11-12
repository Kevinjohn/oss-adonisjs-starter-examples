# US-MASQ-04 — Stop a support mode

As a configured support operator, I want to end the active mode so that subsequent business requests use my operator identity again.

**Status:** Current; source-reviewed, not runtime-tested here.
**Access:** Authenticated raw operator; an API access token needs the `masquerade` ability. Business target credentials are not used to stop the mode.
**Entry:** Browser kits: `POST /masquerade/stop`; API: `POST /masquerade/stop` with the current `X-Masquerade-Context` from `GET /masquerade`.
**Documentation:** [Masquerade API walkthrough](../../apps/api/README.md#api).
**Source:** [Hypermedia stop form](../../apps/hypermedia/resources/views/pages/masquerade/accounts.edge), [Hypermedia controller](../../apps/hypermedia/app/controllers/masquerade_form_controller.ts), [API route mount](../../apps/api/start/masquerade_routes.ts).
**Coverage:** [API Masquerade tests](../../apps/api/tests/functional/masquerade.spec.ts), [browser Masquerade tests](../../apps/hypermedia/tests/browser/masquerade.spec.ts); links identify source behavior coverage, not runtime verification of these docs.

## Acceptance criteria

| Field   | Control                                                                | Required/default/conditions                                |
| ------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| Context | Hidden `_masqueradeContext` form value / `X-Masquerade-Context` header | Current token; browser form also uses the host CSRF token. |

- Browser route runs on the raw operator session. API control route authenticates with the raw API guard and applies its stop limiter.
- With a valid context and no active mode, API stop returns `200` with the idle `control_noop` outcome and does not change the revision. This lets an operator safely stop an already-idle control without creating a new context.
- With an active mode, stop ends it and rotates context; browser flashes completion and redirects to `/masquerade/accounts`, while API returns `200`. If the mode has expired, stop clears it as expired instead of reporting a normal active stop.
- Missing or stale API context is refused; after a lost response, refresh `GET /masquerade` before the next control action. The old context is not reused.
- Stopping support does not sign the operator out or issue the target's credential.

## User flow

```mermaid
flowchart TD
    A["Operator submits stop with current context"] --> B["Authenticate raw operator and check control permission"]
    B --> C{"Context and active mode valid?"}
    C -->|Invalid context| D["Return refusal; do not claim mode ended"]
    C -->|Valid context| E{"Mode state?"}
    E -->|Active| F["End active mode and rotate context"]
    E -->|Idle| G["API returns 200 control_noop without a revision change"]
    E -->|Expired| H["Clear expired mode and report expired outcome"]
    F --> I{"Browser or API?"}
    I -->|Browser| J["Flash completion and redirect to accounts page"]
    I -->|API| K["Return success; fetch GET /masquerade for fresh status"]
```

## Code flow

```mermaid
flowchart TD
    A["Browser POST /masquerade/stop"] --> B["MasqueradeFormController.stop"]
    B --> C["Require raw session guard and parseStopForm"]
    C --> D{"Mode state?"}
    D -->|Active| E["runtime.service.stop ends mode and rotates context"]
    D -->|Idle| F["API returns control_noop without a revision change"]
    D -->|Expired| G["Clear expired mode and return expired outcome"]
    E --> H["Flash result and redirect to /masquerade/accounts"]
    F["API POST /masquerade/stop"] --> G["masqueradeRoutes raw api guard and stop limiter"]
    G --> H["Package stop handler parses context and calls service.stop"]
    H --> I{"Mode state?"}
    I -->|Active| J["End mode and rotate context; return 200"]
    I -->|Idle| K["Return 200 control_noop without revision change"]
    I -->|Expired| L["Clear expired mode and report expired outcome"]
```

**Code references:** [Hypermedia routes](../../apps/hypermedia/start/routes.ts), [Hypermedia form](../../apps/hypermedia/resources/views/pages/masquerade/accounts.edge), [Hypermedia controller](../../apps/hypermedia/app/controllers/masquerade_form_controller.ts), [Hypermedia limiter setup](../../apps/hypermedia/start/masquerade_limiter.ts), [API route factory setup](../../apps/api/start/masquerade_routes.ts), [API limiter setup](../../apps/api/start/masquerade_limiter.ts), [API tests](../../apps/api/tests/functional/masquerade.spec.ts), [Inertia React route/controller](../../apps/inertia-react/start/routes.ts), [React controller](../../apps/inertia-react/app/controllers/masquerade_form_controller.ts), [Inertia Vue route/controller](../../apps/inertia-vue/start/routes.ts), [Vue controller](../../apps/inertia-vue/app/controllers/masquerade_form_controller.ts).
