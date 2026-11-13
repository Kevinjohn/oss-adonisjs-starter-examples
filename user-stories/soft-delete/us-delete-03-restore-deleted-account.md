# US-DELETE-03 — Restore a deleted account

As a configured soft-delete administrator, I want to restore a selected deleted account so that it can be found by normal account lookup again.

**Status:** Current; source-reviewed, not runtime-tested here.
**Access:** The authenticated caller's email must exactly match `SOFT_DELETE_ADMIN_EMAILS`; the selected target must be soft-deleted. Browser checks the default effective session account; API checks the selected raw account guard. The browser restore route is not marked with `allowMutation()`, so it cannot run during active Masquerade even when the effective target is a configured administrator.
**Entry:** Browser kits: submit the “Restore <email>” action; API: `POST /api/v1/admin/deleted-users/:id/restore`.
**Documentation:** [Soft-delete administration guide](../../docs/cookbook/soft-delete-with-account-kit.md#expose-deleted-account-administration).
**Source:** [Hypermedia admin routes](../../apps/hypermedia/start/routes.ts), [API admin routes](../../apps/api/start/routes.ts).
**Coverage:** [API HTTP routes](../../apps/api/tests/functional/soft_delete.spec.ts), [Hypermedia routes](../../apps/hypermedia/tests/functional/soft_delete.spec.ts), [React routes](../../apps/inertia-react/tests/functional/soft_delete.spec.ts), [Vue routes](../../apps/inertia-vue/tests/functional/soft_delete.spec.ts), and [Hypermedia browser journey](../../apps/hypermedia/tests/browser/soft_delete.spec.ts), [React browser journey](../../apps/inertia-react/tests/browser/soft_delete.spec.ts), [Vue browser journey](../../apps/inertia-vue/tests/browser/soft_delete.spec.ts); these links identify source behavior coverage, not runtime verification of these docs.

## Acceptance criteria

- There are no editable fields; the administrator selects a restore button associated with a listed account. API identifies the account by route `:id` and has no body fields.
- The handler checks administrator email, selects with `User.onlyTrashed().where('id', id).firstOrFail()`, and calls `user.restore()`.
- Browser restore is unavailable during active Masquerade because the route does not opt into mutation. API uses the selected raw account identity, not the effective target, and can restore only when that raw account's exact email is configured.
- A non-administrator receives `403`; missing or active account ID is not restored. Successful browser response flashes the account email and returns to the list; API returns restored account ID and email.
- After restoration, normal account queries can find the row again. Password and profile are not reset by restoration.

## User flow

```mermaid
flowchart TD
    A["Administrator selects Restore for a deleted email"] --> B{"Browser or API?"}
    B -->|Browser| C["Submit the matching list button"]
    B -->|API| D["POST restore endpoint with account id"]
    C --> E["Authenticate and check administrator email"]
    D --> E
    E --> F{"Authorized?"}
    F -->|No| G["Return 403"]
    F -->|Yes| H{"Browser restore while Masquerade is active?"}
    H -->|Yes| I["No allowMutation marker; refuse restore"]
    H -->|No or API raw identity| J["Load only a trashed row and restore it"]
    J --> K["Flash and return to list / return account id and email"]
```

## Code flow

```mermaid
flowchart TD
    A["POST admin/deleted-users/:id/restore"] --> B{"Browser effective guard with active mode?"}
    B -->|Yes| C["masqueradeContext refuses unmarked mutation before controller"]
    B -->|No: browser idle or API raw account| D["Authenticate selected account"]
    D --> E["DeletedUsersController.restore checks isSoftDeleteAdmin"]
    E --> F{"Exact email in configured admin set?"}
    F -->|No| G["Return 403"]
    F -->|Yes| H["User.onlyTrashed().where id firstOrFail"]
    H --> I["user.restore"]
    I --> J["Browser flash and redirect or API id and email response"]
```

**Code references:** [Hypermedia routes](../../apps/hypermedia/start/routes.ts), [Deleted-users view and button](../../apps/hypermedia/resources/views/pages/deleted_users.edge), [Hypermedia controller](../../apps/hypermedia/app/controllers/deleted_users_controller.ts), [Hypermedia administrator configuration](../../apps/hypermedia/app/services/soft_delete_admins.ts), [API routes](../../apps/api/start/routes.ts), [API controller](../../apps/api/app/controllers/deleted_users_controller.ts), [API administrator configuration](../../apps/api/app/services/soft_delete_admins.ts), [User soft-delete model](../../apps/api/app/models/user.ts), [API HTTP routes](../../apps/api/tests/functional/soft_delete.spec.ts), [Inertia React controller](../../apps/inertia-react/app/controllers/deleted_users_controller.ts), [Inertia Vue controller](../../apps/inertia-vue/app/controllers/deleted_users_controller.ts).
