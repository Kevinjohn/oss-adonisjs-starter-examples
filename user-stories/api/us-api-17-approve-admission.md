# US-API-17 — Approve an admission approval

As an admitted API instance owner, I want to approve a selected account's admission so that I can allow the approval requirement to become satisfied.

**Status:** Current under the stated kit and configuration conditions; source-reviewed availability.
**Access:** Raw authenticated admitted actor whose instance owner role passes admission authorize.decide; team ownership alone is insufficient.
**Entry:** `POST /api/v1/account/admissions/:id/approve`.
**Documentation:** [API app instructions](../../apps/api/README.md#api).
**Source:** [API routes](../../apps/api/start/routes.ts), [AdmissionsController](../../apps/api/app/controllers/admissions_controller.ts).
**Coverage:** [Existing scenario source](../../apps/api/tests/functional/admission.spec.ts).

## Acceptance criteria

- `id` must be a canonical positive decimal safe-integer user ID, with source spelling no longer than 64 characters. No client actor ID or approval status body is trusted by this handler.
- `AdmissionsController.approve` delegates to `decide(ctx, 'approve')`, which calls `service.approve({ actorId, userId })` and returns `{ userId, approval }`.
- This changes the approval component only. Approval alone does not satisfy invitation/domain requirements.
- Invalid ID, owner-policy refusal or package state failure is surfaced; the handler does not send a decision notification.

## User flow

```mermaid
flowchart TD
    A["Instance owner selects account to approve"] --> B{"Actor and target decision accepted?"}
    B -->|No| C["Receive refusal"]
    B -->|Yes| D["Receive target userId and updated approval"]
    D --> E["Subject reads status; protected data evaluates complete admission"]
```

## Code flow

Scope: API route and controller through the named Account Kit service boundary; the package owns its records and the handler maps the result. No runtime journey was exercised.

```mermaid
flowchart TD
    A["admittedAccount middleware"] --> B["AdmissionsController.approve"]
    B --> C["decide parses target userId and raw actor.id"]
    C --> D["service.approve({ actorId, userId })"]
    D --> E["Owner policy and package transition"]
    E --> F["Return response.ok userId/approval"]
```

**Code references:** [API routes](../../apps/api/start/routes.ts), [AdmissionsController](../../apps/api/app/controllers/admissions_controller.ts), [Admission configuration](../../apps/api/config/admission.ts), [Owner authorization](../../apps/api/app/services/account_kit_authorization.ts), [Current account input](../../apps/api/app/services/account_input.ts), [Admitted route gate](../../apps/api/app/middleware/admitted_account_middleware.ts).
