# US-API-12 — Resend a scoped invitation

As an API scope manager, I want to resend an existing invitation so that the recipient can receive a replacement link.

**Status:** Current under the stated kit and configuration conditions; source-reviewed availability.
**Access:** Raw authenticated verified account and invitation-management policy; blocker applies.
**Entry:** `POST /api/v1/account/invitations/:id/resend`.
**Documentation:** [API app instructions](../../apps/api/README.md#api).
**Source:** [API routes](../../apps/api/start/routes.ts), [Resend handler](../../apps/api/app/controllers/invitations_controller.ts).
**Coverage:** [Existing scenario source](../../apps/api/tests/functional/account_invitations.spec.ts).

## Acceptance criteria

- The route ID must convert to a positive safe integer. No recipient/role replacement field is accepted by this handler; it resends the selected invitation under package authorization.
- On normal completion, return 200 `{ id }`. A recognized delivery/post-commit failure is logged by `committedFollowUp` and returns 202 `{ requested: true }`; this acknowledges committed work without claiming delivery.
- A completed resend invalidates the previous invitation link and makes a replacement proof current. The recipient uses the newest link available through configured delivery. If delivery is uncertain or an old link is opened, the manager checks the resend outcome and requests another resend if needed; the recipient must use only the newest proof. A 202 does not restore the previous link or confirm delivery.
- Invalid identity, authorization or other unexpected failure propagates. Resend does not allow the caller to manage a foreign scope merely by knowing an ID.

- Supplied notification delivery uses [development server output and API process-memory records](../REFERENCE.md#proof-delivery-boundary), rather than real inbox mail.

## User flow

```mermaid
flowchart TD
    A["Manager submits resend for invitation ID"] --> B{"Package accepts request?"}
    B -->|No| C1["Receive refusal"]
    B -->|Yes| C2["Previous invitation proof is invalidated; replacement proof is current"]
    C2 --> D{"Follow-up delivery completed?"}
    D -->|Yes| E["Receive 200; current proof is available through configured delivery"]
    D -->|Recognized failure| F["Receive 202; request committed, delivery unconfirmed"]
    E --> G{"Recipient has the newest proof?"}
    F --> G
    G -->|Yes| H["Recipient uses the newest proof; previous links are invalid"]
    G -->|No, or an old link was opened| I["Manager checks resend outcome and requests another resend if needed"]
    I --> A
```

## Code flow

Scope: API route and controller through the named Account Kit service boundary; the package owns its records and the handler maps the result. No runtime journey was exercised.

```mermaid
flowchart TD
    A["InvitationsController.resend"] --> B["invitationIdParam and raw actor.id"]
    B --> C["committedFollowUp wraps invitations.resend({ actorId, invitationId })"]
    C --> D{"Result returned?"}
    D -->|Yes| E["response.ok({ id })"]
    D -->|Recognized committed failure| F["response.accepted({ requested: true })"]
```

**Code references:** [API routes](../../apps/api/start/routes.ts), [Resend handler](../../apps/api/app/controllers/invitations_controller.ts), [Committed follow-up mapper](../../apps/api/app/services/committed_failure_diagnostic.ts).
