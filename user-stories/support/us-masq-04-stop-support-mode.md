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
- A valid stop ends the active mode and rotates its context. Browser flashes completion and redirects to `/masquerade/accounts`; API returns success, after which the operator can fetch current status.
- Missing or stale context and unavailable mode are refused; the old context is not reused after a response is lost. Refresh `GET /masquerade` before the next control action.
- Stopping support does not sign the operator out or issue the target's credential.

## User flow

```mermaid
flowchart TD
    A["Operator submits stop with current context"] --> B["Authenticate raw operator and check control permission"]
    B --> C{"Context and active mode valid?"}
    C -->|No| D["Show or return refusal; do not claim mode ended"]
    C -->|Yes| E["Stop mode and rotate context"]
    E --> F{"Browser or API?"}
    F -->|Browser| G["Flash completion and redirect to accounts page"]
    F -->|API| H["Return success; fetch GET /masquerade for fresh status"]
```

## Code flow

```mermaid
flowchart TD
    A["Browser POST /masquerade/stop"] --> B["MasqueradeFormController.stop"]
    B --> C["Require raw session guard and parseStopForm"]
    C --> D["runtime.service.stop"]
    D --> E["Flash result and redirect to /masquerade/accounts"]
    F["API POST /masquerade/stop"] --> G["masqueradeRoutes raw api guard and stop limiter"]
    G --> H["Package stop handler parses context and calls service.stop"]
    H --> I["Return success response; status can be fetched again"]
```

**Code references:** [Hypermedia routes](../../apps/hypermedia/start/routes.ts), [Hypermedia form](../../apps/hypermedia/resources/views/pages/masquerade/accounts.edge), [Hypermedia controller](../../apps/hypermedia/app/controllers/masquerade_form_controller.ts), [Hypermedia limiter setup](../../apps/hypermedia/start/masquerade_limiter.ts), [API route factory setup](../../apps/api/start/masquerade_routes.ts), [API limiter setup](../../apps/api/start/masquerade_limiter.ts), [API tests](../../apps/api/tests/functional/masquerade.spec.ts), [Inertia React route/controller](../../apps/inertia-react/start/routes.ts), [React controller](../../apps/inertia-react/app/controllers/masquerade_form_controller.ts), [Inertia Vue route/controller](../../apps/inertia-vue/start/routes.ts), [Vue controller](../../apps/inertia-vue/app/controllers/masquerade_form_controller.ts).
