# US-ACCOUNT-12 — Open the signed-in dashboard

As a signed-in account owner, I want to open my dashboard so that I can see my account home and whether email confirmation is complete.

**Status:** Current; source-reviewed, not runtime-tested here.
**Access:** Browser dashboard uses the default effective session guard. `/account` in Hypermedia, React and Vue additionally requires the effective account to be verified.
**Entry:** Browser kits: `GET /dashboard` and verified-only `GET /account`.
**Documentation:** [Hypermedia dashboard view](../../apps/hypermedia/resources/views/pages/dashboard.edge).
**Source:** [Hypermedia routes](../../apps/hypermedia/start/routes.ts), [Hypermedia dashboard controller](../../apps/hypermedia/app/controllers/dashboard_controller.ts), [Inertia React routes](../../apps/inertia-react/start/routes.ts), [Inertia Vue routes](../../apps/inertia-vue/start/routes.ts).
**Coverage:** [Hypermedia Masquerade browser test](../../apps/hypermedia/tests/browser/masquerade.spec.ts), [Inertia React Masquerade browser test](../../apps/inertia-react/tests/browser/masquerade.spec.ts), [Inertia Vue Masquerade browser test](../../apps/inertia-vue/tests/browser/masquerade.spec.ts); these links identify source behavior coverage, not runtime verification of these docs.

## Acceptance criteria

- There are no editable fields; an authenticated account opens `/dashboard`.
- All three kits show the account dashboard and effective identity during support mode. Unconfirmed owners see a verification notice. The protected `/account` page is separate: all kits require an authenticated, verified effective session account.
- All three kits provide a separate `/account` page for verified effective session accounts. React and Vue render their account page; Hypermedia renders its account page. Dashboard access alone does not establish this protected-page journey.
- Unauthenticated requests are sent through the configured authentication response. Hypermedia `/account` additionally requires a verified effective account.
- The API has no dashboard route; its account profile read is documented separately.

## User flow

```mermaid
flowchart TD
    A["Open the dashboard"] --> B{"Which browser kit?"}
    B -->|Hypermedia| C["See effective email and confirmation state"]
    B -->|React or Vue| D["See the starter dashboard and any verification notice"]
    C --> E["Choose Send a fresh verification link when shown"]
    D --> F["Choose Resend link when shown"]
    C --> G["Open /account as a verified account"]
    D --> G
    G --> H{"Verified effective session?"}
    H -->|No| I["See sign-in or verification refusal"]
    H -->|Yes| J["See the kit-specific account page"]
```

## Code flow

```mermaid
flowchart TD
    A["GET /dashboard"] --> B["auth middleware uses configured default effective session guard"]
    B --> C["Hypermedia DashboardController.show or Inertia renderInertia route"]
    C --> D["Hypermedia computes verified from unverifiedEmail versus email"]
    C --> E["Inertia pages render starter home and verification notice"]
    D --> F["Render dashboard; verified-only /account is a separate route"]
    E --> F
```

**Code references:** [Hypermedia routes](../../apps/hypermedia/start/routes.ts), [Hypermedia controller](../../apps/hypermedia/app/controllers/dashboard_controller.ts), [Hypermedia dashboard](../../apps/hypermedia/resources/views/pages/dashboard.edge), [Inertia React route](../../apps/inertia-react/start/routes.ts), [React dashboard](../../apps/inertia-react/inertia/pages/dashboard.tsx), [Inertia Vue route](../../apps/inertia-vue/start/routes.ts), [Vue dashboard](../../apps/inertia-vue/inertia/pages/dashboard.vue), [Vue shared Inertia props](../../apps/inertia-vue/app/middleware/inertia_middleware.ts).
