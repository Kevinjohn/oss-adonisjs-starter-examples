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
- The account kit may reuse a recent link instead of sending another message. All three browser controllers distinguish `already_verified` with **Your email address is already confirmed.** Other React/Vue results explain the one-minute reuse window and retry wait. API returns `{ result: ... }`, defaulting a missing follow-up result to `sent`.
- Hypermedia catches delivery failure, logs it, flashes a retryable error and redirects back. React/Vue controllers await the send without a local catch; the shared exception handler flashes that the change was saved but email delivery or a follow-up failed, advises waiting one minute before another verification request, and redirects back. API recognized delivery/post-commit failure is logged by `committedFollowUp`. No response proves inbox delivery; see the [supplied proof-delivery boundary](../REFERENCE.md#proof-delivery-boundary).
- Requesting a link does not itself mark the email verified; verification requires completing the token flow.

## User flow

```mermaid
flowchart TD
    A["Signed-in owner submits the resend action"] --> B["The app processes the request"]
    B --> C{"Outcome?"}
    C -->|Hypermedia send failure| D["Return to the previous page with a retryable error"]
    C -->|React/Vue send failure| K["Return with saved-change failure feedback; wait one minute before retrying"]
    C -->|Any browser already verified| E["See that the address is already confirmed"]
    C -->|Hypermedia link due| F["See that a link is on its way"]
    C -->|React/Vue success| L["See that a recent link may be reused within one minute and when to retry"]
    C -->|API result| G["Receive result field, including fallback sent after recognized follow-up failure"]
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
    D -->|Hypermedia returned| E["Flash already-confirmed or link-on-way feedback"]
    D -->|Hypermedia delivery error| F["Log failure and flash retryable error"]
    D -->|React/Vue returned| G["Flash already-confirmed or one-minute reuse guidance; redirect back"]
    D -->|React/Vue error| H["HttpExceptionHandler flashes saved-change email/follow-up failure with one-minute wait; redirects back"]
    D -->|API returned| K["Return { result } from service outcome"]
    D -->|API delivery or post-commit error| I["committedFollowUp logs failure and response uses fallback result"]
    E --> J["Verification remains a separate token-completion action"]
    F --> J
    G --> J
```

**Code references:** [Hypermedia route](../../apps/hypermedia/start/routes.ts), [Hypermedia controller](../../apps/hypermedia/app/controllers/email_verifications_controller.ts), [API route and accountAccess middleware](../../apps/api/start/routes.ts), [API controller](../../apps/api/app/controllers/email_verifications_controller.ts), [Committed-failure handling](../../apps/api/app/services/committed_failure_diagnostic.ts), [Email-verification functional tests](../../apps/api/tests/functional/account_email_verification.spec.ts), [Inertia React controller](../../apps/inertia-react/app/controllers/email_verifications_controller.ts), [Inertia Vue controller](../../apps/inertia-vue/app/controllers/email_verifications_controller.ts), [React exception handler](../../apps/inertia-react/app/exceptions/handler.ts), [Vue exception handler](../../apps/inertia-vue/app/exceptions/handler.ts).
