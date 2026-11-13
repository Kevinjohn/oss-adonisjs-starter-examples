# US-ACCOUNT-11 — Confirm an email address

As the recipient of an email-verification link, I want to prove control of the address so that it becomes confirmed for account access.

**Status:** Current; source-reviewed, not runtime-tested here.
**Access:** Anyone holding a valid, unexpired, unused verification token, unless the Account Kit blocker refuses the request during support mode; token page and API proof responses use no-store/no-referrer headers.
**Entry:** Browser kits: `GET/POST /verify-email/:token`; API: `GET/POST /api/v1/auth/email-verification/:token`.
**Documentation:** [Hypermedia verification form](../../apps/hypermedia/resources/views/pages/auth/verify_email.edge).
**Source:** [Hypermedia routes](../../apps/hypermedia/start/routes.ts), [API routes](../../apps/api/start/routes.ts).
**Coverage:** [Email-verification functional tests](../../apps/api/tests/functional/account_email_verification.spec.ts); this link identifies source behavior coverage, not runtime verification of these docs.

## Acceptance criteria

| Field                                                                      | Control                      | Required/default/conditions                            |
| -------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------ |
| Choose a password (Hypermedia) / Password (React, Vue), API key `password` | Password input / JSON string | Required; 8–256 characters.                            |
| Confirm password (`passwordConfirmation`)                                  | Password input / JSON string | Required; must match Password.                         |
| Token                                                                      | Link / URL parameter         | Required; valid, unexpired, unused verification token. |

- The browser inspects the link before showing the form. API clients can inspect it with `GET`; valid proof returns `confirmation: true`.
- Completing a valid token with the password and confirmation activates the address. The browser then asks the owner to sign in with the password entered in this form; API returns the operation result.
- Invalid, expired, or used token does not verify the address. Browser GET renders an unusable-link page; API GET returns invalid-token proof failure; Hypermedia invalid POST redirects to sign-in with a fresh-link message, and Inertia POST follows the proof-recovery fallback and flashes invalid-link feedback; API returns `E_ACCOUNT_KIT_INVALID_EMAIL_TOKEN` proof failure.
- Invalid-page recovery: Hypermedia offers **Sign in**. React offers **Go to dashboard** when signed in or **Sign in** otherwise. Vue offers **Sign in**.
- A recognized delivery or post-commit failure after verification is logged. The browser still reports verification and redirects to sign-in; API still returns the result-shaped response, whose fallback value is `verified` when follow-up handling returns no result.
- Inertia terminates the current raw web session after successful verification when signed in; Hypermedia redirects to sign-in without terminating it. The proof does not sign the browser in as the address owner.

- Delivery availability follows the [supplied proof-delivery boundary](../REFERENCE.md#proof-delivery-boundary): development proof links use server output, and the API also records notices in process memory; no supplied adapter proves inbox delivery.

## User flow

```mermaid
flowchart TD
    A["Open the verification link"] --> Z{"Account Kit blocker permits this request?"}
    Z -->|No, during support mode| Z1["Request is refused; end support mode, then reopen the link"]
    Z -->|Yes| B["See whether it can be used"]
    B --> C{"Link valid on opening?"}
    C -->|Browser: no| D["See unusable-link page and the kit-specific dashboard or sign-in recovery"]
    C -->|API: no| L["Receive invalid-token refusal"]
    C -->|Yes| E["Enter and submit the password and confirmation"]
    E --> F{"Link still valid when submitted?"}
    F -->|No| G["Hypermedia returns to sign-in; Inertia uses invalid-link recovery; API refuses the token"]
    F -->|Yes| H["See confirmation and sign-in instructions"]
    H --> I{"Browser or API?"}
    I -->|Browser| J["Sign in with the password chosen on the page"]
    I -->|API| K["Receive the verification result"]
```

## Code flow

Scope: the implemented app routes and controllers delegate account persistence to the named Account Kit service, then reconcile the documented response.

```mermaid
flowchart TD
    A["Request verification route"] --> Z["Account Kit blocker"]
    Z -->|Allowed| B["Controller inspects with emailVerification.inspect"]
    Z -->|Blocked during support mode| Z1["Refuse before token inspection or completion"]
    B --> C{"Valid token?"}
    C -->|No| D["Render invalid state or proofFailure with E_ACCOUNT_KIT_INVALID_EMAIL_TOKEN"]
    C -->|Yes| E["POST handler validates password and confirmation"]
    E --> F["emailVerification.complete"]
    F --> G{"Completion result?"}
    G -->|Invalid POST token| J["Hypermedia redirects to sign-in; Inertia flashes and redirects to proof.fallback; API proofFailure returns E_ACCOUNT_KIT_INVALID_EMAIL_TOKEN"]
    G -->|Verified| H["Browser redirects to sign-in; API returns result"]
    G -->|Recognized committed follow-up failure| I["Log failure; verification remains committed and completion response is returned"]
```

**Code references:** [Hypermedia route](../../apps/hypermedia/start/routes.ts), [Hypermedia controller](../../apps/hypermedia/app/controllers/email_verifications_controller.ts), [Hypermedia validator](../../apps/hypermedia/app/validators/account.ts), [API routes](../../apps/api/start/routes.ts), [API controller](../../apps/api/app/controllers/email_verifications_controller.ts), [API validator](../../apps/api/app/validators/account_kit.ts), [Proof response headers](../../apps/api/app/services/http_responses.ts), [Email-verification functional tests](../../apps/api/tests/functional/account_email_verification.spec.ts), [Inertia React controller](../../apps/inertia-react/app/controllers/email_verifications_controller.ts), [Inertia Vue controller](../../apps/inertia-vue/app/controllers/email_verifications_controller.ts), [Hypermedia token page](../../apps/hypermedia/resources/views/pages/auth/verify_email.edge), [React token page](../../apps/inertia-react/inertia/pages/auth/verify_email.tsx), [Vue token page](../../apps/inertia-vue/inertia/pages/auth/verify_email.vue), [Inertia invalid-proof fallback](../../apps/inertia-react/app/services/token_page_headers.ts), [React exception handler](../../apps/inertia-react/app/exceptions/handler.ts), [Vue exception handler](../../apps/inertia-vue/app/exceptions/handler.ts).
