# US-API-22 — Inspect effective identity and protected sample access

As an API caller, I want to inspect the effective account and try a protected action so that I can see how the Masquerade API control guard behaves.

**Status:** Current in the API sample; source-reviewed, not runtime-tested here.
**Access:** Authenticated effective API account. Both sample routes use `api_effective` regardless of `ACCOUNT_KIT_AUTH_STRATEGY`; raw-bearer control routes use a separate guard and require `masquerade` ability in access-token mode.
**Entry:** `GET /api/v1/masquerade/account`; `POST /api/v1/masquerade/sensitive`.
**Documentation:** [API app guide](../../apps/api/README.md#api).
**Source:** [Masquerade sample routes](../../apps/api/start/masquerade_routes.ts).
**Coverage:** [Masquerade functional tests](../../apps/api/tests/functional/masquerade.spec.ts).

## Acceptance criteria

- **Effective identity read:** `GET /api/v1/masquerade/account` returns the admitted effective account ID and email: the actor while idle or target during valid active mode. Admission may expire or invalidate an active mode and refuse the triggering request; this read does not promise unchanged mode state in every case. It does not return a context token.
- **Sensitive action:** first read current context with raw-bearer `GET /masquerade`. `POST /api/v1/masquerade/sensitive` requires the current `X-Masquerade-Context` even while idle. Missing or stale context is refused. Any active mode is refused by the sensitive route marker, including edit mode with valid context; only admitted idle state with valid context reaches the handler returning `{ allowed: true }`.
- `sensitive()` marks the route. `masqueradeContext` enforces admission, context freshness and the sensitive marker before the sample handler runs; it is not a separate context-validation guard.
- Both business samples explicitly use `api_effective` regardless of `ACCOUNT_KIT_AUTH_STRATEGY`. Their authentication and effects are separate from the raw `api` bearer guard used by `/masquerade` controls. A safe identity read does not require an unsafe context header.

## User flow

```mermaid
flowchart TD
    A["Use an authenticated API identity"] --> B{"Which sample outcome?"}
    B -->|Read identity| C["Request the effective account endpoint"]
    C --> D{"Request admitted?"}
    D -->|No| E["Receive authentication or mode-context refusal; refresh status when needed"]
    D -->|Yes| F["Receive actor or target ID and email, without a context token"]
    B -->|Try sensitive action| G["Read current context from raw-bearer GET /masquerade"]
    G --> H["Submit sensitive action with the current context header"]
    H --> I{"Admission and current context accepted?"}
    I -->|No| E
    I -->|Yes| J{"Support mode active?"}
    J -->|Yes| K["Receive sensitive-action refusal even in edit mode"]
    J -->|No| L["Receive allowed true"]
```

## Code flow

Scope: the two mounted business routes; the raw status endpoint supplies the POST prerequisite context token.

```mermaid
flowchart TD
    A["GET account or POST sensitive sample route"] --> B["masqueradeContext calls runtime.admit"]
    B --> C{"Admission succeeds?"}
    C -->|No| D["Refuse triggering request; admission may clear expired or invalid mode"]
    C -->|Yes| E{"Unsafe POST?"}
    E -->|No: GET| F["auth middleware selects api_effective"]
    F --> G["auth.getUserOrFail; return id and email"]
    E -->|Yes| H["masqueradeContext requires current X-Masquerade-Context"]
    H --> I{"Context matches?"}
    I -->|No| J["Refuse missing or stale context"]
    I -->|Yes| K{"Active mode and sensitive route marker?"}
    K -->|Yes| L["Throw E_MASQUERADE_ACTION_BLOCKED with blockedBy sensitive"]
    K -->|No: idle| M["auth middleware selects api_effective; handler returns allowed true"]
```

**Code references:** [Mounted samples and sensitive marker](../../apps/api/start/masquerade_routes.ts), [Context middleware](../../apps/api/app/middleware/masquerade_context_middleware.ts), [Enforcement configuration](../../apps/api/config/masquerade.ts), [Context middleware kernel order](../../apps/api/start/kernel.ts), [API Masquerade tests](../../apps/api/tests/functional/masquerade.spec.ts).
