# US-TEAM-05 — Accept a team invitation

As an invitation recipient, I want to accept a valid invitation so that I can create my account and join the intended team with the role chosen by the inviter.

**Status:** Current; source-reviewed, not runtime-tested here.
**Access:** Public invitation link with valid, unexpired, unused token; the invited email is supplied by the invitation record.
**Entry:** Browser kits: `GET/POST /invitation/:token`; API: `GET/POST /api/v1/auth/invitations/:token`.
**Documentation:** [Hypermedia invitation page](../../apps/hypermedia/start/routes.ts).
**Source:** [Hypermedia routes](../../apps/hypermedia/start/routes.ts), [API routes](../../apps/api/start/routes.ts).
**Coverage:** [Invitation functional tests](../../apps/api/tests/functional/account_invitations.spec.ts); this link identifies source behavior coverage, not runtime verification of these docs.

## Acceptance criteria

| Field                | Control                      | Required/default/conditions                                                                             |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| Full name (optional) | Text input / JSON string     | Optional; trimmed; maximum 255 characters.                                                              |
| Password             | Password input / JSON string | Required; 8–256 characters.                                                                             |
| Confirm password     | Password input / JSON string | Required; must match Password.                                                                          |
| Token                | Link / URL parameter         | Required; valid, unexpired, unused; invited email is displayed from the invitation and is not editable. |

- Browser inspects the invitation before rendering the form. API `GET` returns invitation details for a valid token; proof responses use no-store/no-referrer headers.
- Valid acceptance creates the invited account and team membership with the role attached to the invitation. Browser redirects to sign-in; API returns `201` with user ID, email, and verification state.
- Invalid, expired, used, or concurrently consumed token does not create a second account or membership. Browser GET inspection renders an unusable-invitation page; API GET returns invalid-token proof failure; Hypermedia invalid POST redirects to sign-in, while Inertia POST follows the proof-recovery fallback and flashes invalid-link feedback; API returns `E_ACCOUNT_KIT_INVALID_TOKEN` proof failure.
- Invalid-page recovery: Hypermedia shows the unavailable invitation with no recovery control on that page; React and Vue offer **Sign in**.
- If a recognized delivery or post-commit failure follows committed acceptance, the browser logs it and still reports the account ready; API logs it and returns `202` with `accepted: true`.

- Delivery availability follows the [supplied proof-delivery boundary](../REFERENCE.md#proof-delivery-boundary): development proof links use server output, and the API also records notices in process memory; no supplied adapter proves inbox delivery.

## User flow

```mermaid
flowchart TD
    A["Open the invitation link"] --> B["See whether it is available and which address it is for"]
    B --> C{"Invitation valid on opening?"}
    C -->|Browser: no| D["See unavailable invitation; Inertia offers Sign in, Hypermedia has no page recovery control"]
    C -->|API: no| K["Receive invalid-token refusal"]
    C -->|Yes| E["Enter optional name and matching password fields"]
    E --> F["Submit invitation acceptance"]
    F --> G{"Invitation still valid when submitted?"}
    G -->|No| H["Hypermedia returns to sign-in; Inertia uses invalid-link recovery; API refuses the token"]
    G -->|Yes| I["See that the account is ready and sign in"]
```

## Code flow

```mermaid
flowchart TD
    A["GET /invitation/:token or GET /api/v1/auth/invitations/:token"] --> B["kit.invitations.inspect / accountKit.invitations.inspect"]
    B --> C{"Valid invitation?"}
    C -->|No| D["Render unavailable form / proofFailure E_ACCOUNT_KIT_INVALID_TOKEN"]
    C -->|Yes| E["POST handler validates optional name, password, and confirmation"]
    E --> F["kit.invitations.accept / accountKit.invitations.accept"]
    F --> G{"Result?"}
    G -->|User created| H["Browser redirects to sign-in / API returns 201 account fields"]
    G -->|Delivery or post-commit error after commit| I["Log failure; browser redirects / API returns 202 accepted true"]
    G -->|Invalid POST token| J["Hypermedia redirects to sign-in; Inertia flashes and redirects to proof.fallback; API proofFailure returns E_ACCOUNT_KIT_INVALID_TOKEN"]
```

**Code references:** [Hypermedia invitation routes](../../apps/hypermedia/start/routes.ts), [Hypermedia controller](../../apps/hypermedia/app/controllers/invitations_controller.ts), [Hypermedia validator](../../apps/hypermedia/app/validators/team.ts), [API invitation routes](../../apps/api/start/routes.ts), [API controller](../../apps/api/app/controllers/invitations_controller.ts), [API validator](../../apps/api/app/validators/account_kit.ts), [Proof response headers](../../apps/api/app/services/http_responses.ts), [Invitation functional tests](../../apps/api/tests/functional/account_invitations.spec.ts), [Inertia React controller](../../apps/inertia-react/app/controllers/invitations_controller.ts), [Inertia Vue controller](../../apps/inertia-vue/app/controllers/invitations_controller.ts), [Hypermedia token page](../../apps/hypermedia/resources/views/pages/auth/accept_invitation.edge), [React token page](../../apps/inertia-react/inertia/pages/auth/accept_invitation.tsx), [Vue token page](../../apps/inertia-vue/inertia/pages/auth/accept_invitation.vue), [Inertia invalid-proof fallback](../../apps/inertia-react/app/services/token_page_headers.ts), [React exception handler](../../apps/inertia-react/app/exceptions/handler.ts), [Vue exception handler](../../apps/inertia-vue/app/exceptions/handler.ts).
