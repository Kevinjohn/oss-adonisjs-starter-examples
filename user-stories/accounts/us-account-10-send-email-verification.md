# US-ACCOUNT-10 — Request an email verification link

As a signed-in account owner, I want to request a verification link so that I can confirm my address and use protected account features.

**Status:** Current; source-reviewed, not runtime-tested here.
**Access:** Signed-in account owner; account-kit account blocker applies. The API route also checks account access.
**Entry:** Browser kits: `POST /email-verification`; API: `POST /api/v1/account/email-verification/send`.
**Documentation:** [Hypermedia email settings](../../apps/hypermedia/resources/views/pages/settings/email.edge).
**Source:** [Hypermedia routes](../../apps/hypermedia/start/routes.ts), [API routes](../../apps/api/start/routes.ts).
**Coverage:** [Email-verification functional tests](../../apps/api/tests/functional/account_email_verification.spec.ts); this link identifies source behavior coverage, not runtime verification of these docs.

## Acceptance criteria

- There are no editable fields; an authenticated owner invokes the action from email settings or sends the API request.
- The account kit sends only when another verification link is due. Browser feedback distinguishes already-confirmed email and otherwise says a link is on its way; API returns `{ result: ... }`, with the implementation defaulting a missing follow-up result to `sent`.
- Browser delivery failure is logged and shown as a retryable error. API recognized delivery/post-commit failure is logged by `committedFollowUp`; because the operation may already have committed, the response keeps its result shape and should not be read as proof that mail was delivered.
- Requesting a link does not itself mark the email verified; verification requires completing the token flow.

## User flow

```mermaid
flowchart TD
    A["Signed-in owner requests verification"] --> B["EmailVerificationsController.store / send calls emailVerification.send"]
    B --> C{"Outcome?"}
    C -->|Browser delivery failure| D["Log failure and show retryable error"]
    C -->|Browser already verified| E["Tell owner the address is already confirmed"]
    C -->|Browser link due or sent| F["Tell owner a link is on its way"]
    C -->|API result| G["Return result field; a recognized follow-up failure is logged"]
    E --> H["Email state changes only when the confirmation token is completed"]
    F --> H
    G --> H
```

## Code flow

Scope: the implemented app routes and controllers delegate account persistence to the named Account Kit service, then reconcile the documented response.

```mermaid
flowchart TD
    A["POST /email-verification or POST /api/v1/account/email-verification/send"] --> B["Browser auth or API accountAccess route guard"]
    B --> C["emailVerification.send with signed-in account id"]
    C --> D{"Returned or recognized committed failure?"}
    D -->|Returned| E["Browser flashes already-verified or link-on-way feedback; API returns result"]
    D -->|Browser delivery error| F["Log failure and flash retryable error"]
    D -->|API delivery or post-commit error| G["committedFollowUp logs failure and response uses fallback result"]
    E --> H["Verification remains a separate token-completion action"]
    F --> H
    G --> H
```

**Code references:** [Hypermedia route](../../apps/hypermedia/start/routes.ts), [Hypermedia controller](../../apps/hypermedia/app/controllers/email_verifications_controller.ts), [API route and accountAccess middleware](../../apps/api/start/routes.ts), [API controller](../../apps/api/app/controllers/email_verifications_controller.ts), [Committed-failure handling](../../apps/api/app/services/committed_failure_diagnostic.ts), [Email-verification functional tests](../../apps/api/tests/functional/account_email_verification.spec.ts), [Inertia React controller](../../apps/inertia-react/app/controllers/email_verifications_controller.ts), [Inertia Vue controller](../../apps/inertia-vue/app/controllers/email_verifications_controller.ts).
