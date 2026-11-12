# US-ACCOUNT-09 — Complete a password reset

As the recipient of a reset link, I want to choose a new password so that I can sign in with a replacement credential.

**Status:** Current; source-reviewed, not runtime-tested here.
**Access:** Anyone holding a valid, unexpired, unused reset token; API proof responses and browser token page use no-store/no-referrer headers.
**Entry:** Browser kits: `GET/POST /reset-password/:token`; API: `GET/POST /api/v1/auth/password-reset/:token`.
**Documentation:** [Hypermedia reset form](../../apps/hypermedia/resources/views/pages/auth/reset_password.edge).
**Source:** [Hypermedia routes](../../apps/hypermedia/start/routes.ts), [API routes](../../apps/api/start/routes.ts).
**Coverage:** [Password-reset functional tests](../../apps/api/tests/functional/account_password_reset.spec.ts); this link identifies source behavior coverage, not runtime verification of these docs.

## Acceptance criteria

| Field                                      | Control                      | Required/default/conditions               |
| ------------------------------------------ | ---------------------------- | ----------------------------------------- |
| New password (browser), API key `password` | Password input / JSON string | Required; 8–256 characters.               |
| Confirm password (`passwordConfirmation`)  | Password input / JSON string | Required; must match Password.            |
| Token                                      | Link / URL parameter         | Required; valid, unexpired, unused token. |

- The browser inspects the link before showing the form. API clients can inspect it with `GET`; a valid token returns `valid: true`.
- A valid token and matching password replace the credential. Browser redirects to sign-in; API returns `202` with a password-reset acknowledgement. Recognized delivery or post-commit failures after the reset are logged and do not report the reset as uncommitted.
- Invalid or expired tokens do not reset the password. Browser redirects to the forgot-password page; API returns the invalid-token proof response. Password and confirmation validation errors do not change the credential.
- The API limits reset completion requests through `accountPublicLimit('password-reset')`.

## User flow

```mermaid
flowchart TD
    A["Recipient opens reset link"] --> B["PasswordResetsController.edit / inspect checks token"]
    B --> C{"Token valid?"}
    C -->|No| D["Show invalid-link state or return invalid-token proof response"]
    C -->|Yes| E["Recipient enters and confirms a new password"]
    E --> F["resetPasswordValidator / passwordValidator checks password fields"]
    F --> G["passwordReset.reset commits the new credential"]
    G --> H{"Browser or API?"}
    H -->|Browser| I["Log recognized follow-up failure if present and redirect to sign-in"]
    H -->|API| J["Return 202; committedFollowUp logs recognized follow-up failure"]
```

## Code flow

Scope: the implemented app routes and controllers delegate account persistence to the named Account Kit service, then reconcile the documented response.

```mermaid
flowchart TD
    A["GET /reset-password/:token or GET /api/v1/auth/password-reset/:token"] --> B["passwordReset.inspect"]
    B --> C{"Valid token?"}
    C -->|No| D["Render invalid state or proofFailure with E_ACCOUNT_KIT_INVALID_PASSWORD_TOKEN"]
    C -->|Yes| E["POST handler validates password and confirmation"]
    E --> F["passwordReset.reset"]
    F --> G{"Completion result?"}
    G -->|InvalidTokenError| D
    G -->|Password changed| H["Redirect browser to sign-in or return API 202"]
    G -->|Recognized committed follow-up failure| I["Log failure; password remains changed; return the same success-shaped completion outcome"]
```

**Code references:** [Hypermedia routes](../../apps/hypermedia/start/routes.ts), [Hypermedia controller](../../apps/hypermedia/app/controllers/password_resets_controller.ts), [Hypermedia validator](../../apps/hypermedia/app/validators/account.ts), [API routes](../../apps/api/start/routes.ts), [API controller](../../apps/api/app/controllers/password_resets_controller.ts), [API validator](../../apps/api/app/validators/account_kit.ts), [Proof response headers](../../apps/api/app/services/http_responses.ts), [Password-reset functional tests](../../apps/api/tests/functional/account_password_reset.spec.ts), [Inertia React controller](../../apps/inertia-react/app/controllers/password_resets_controller.ts), [Inertia Vue controller](../../apps/inertia-vue/app/controllers/password_resets_controller.ts).
