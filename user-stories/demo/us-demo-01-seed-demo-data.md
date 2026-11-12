# US-DEMO-01 — Seed demo accounts and team data

As an example-app operator, I want to seed the configured demo accounts and team so that I can use the walkthrough with repeatable data.

**Status:** Demo; the seeder prepares walkthrough data, not a normal account action.
**Access:** Operator running the kit seeder against its configured Lucid database after migrations.
**Entry:** From an app directory: `node ace db:seed`.
**Documentation:** [Hypermedia quick start](../../apps/hypermedia/README.md#try-it).
**Source:** [Hypermedia demo seeder](../../apps/hypermedia/database/seeders/demo_seeder.ts).
**Coverage:** [Demo seeder functional tests](../../apps/hypermedia/tests/functional/demo_seeder.spec.ts); this link identifies source behavior coverage, not runtime verification of these docs.

## Acceptance criteria

- There are no form fields; the operator runs the seeder after database migrations.
- The seeder considers the first configured Masquerade operator address, first configured soft-delete administrator address, Alice, and Bob; duplicate addresses are de-duplicated. Existing users, including soft-deleted users, are preserved and not reset.
- Browser kits create missing accounts with a name from the email prefix, `DemoPassword123!`, and confirmed email. API also creates one `account_admissions` row per newly created account, recording invitation evidence as source `operator` and approval `approved`. Existing active or trashed API accounts are skipped entirely; no admission evidence is added for them. The number of created accounts depends on configured addresses and existing rows.
- Alice's owned `Demo team` is created with Bob as a viewer in one transaction when no matching team exists. If the matching owned team already exists, the seeder adds Bob as viewer only when he has no membership; an existing Bob membership is left as-is.
- Database or transaction failures surface from the seeder. The configured database is used; no in-memory storage is substituted.

## User flow

```mermaid
flowchart TD
    A["Operator runs node ace db:seed in a kit app"] --> B["Read configured operator/admin addresses"]
    B --> C["De-duplicate those addresses with Alice and Bob"]
    C --> D{"Kit and existing user?"}
    D -->|Browser missing| E["Create demo user; preserve existing users"]
    D -->|API missing| F["Create user and admission evidence"]
    D -->|Existing API user| G["Skip user without adding admission evidence"]
    E --> H["Load Alice and Bob; search Alice's owned Demo team"]
    F --> H
    G --> H
    H --> I{"Matching team exists?"}
    I -->|No| J["Create team, Alice owner, and Bob viewer in one transaction"]
    I -->|Yes| K["Add Bob as viewer only if he has no membership"]
```

## Code flow

```mermaid
flowchart TD
    A["DemoSeeder.run"] --> B["Read first configured operator/admin addresses"]
    B --> C["Set of configured addresses, Alice, and Bob"]
    C --> D{"Account exists and which kit?"}
    D -->|Existing| E["Skip existing row; do not add API admission evidence"]
    D -->|Missing browser account| F["Create verified user with demo password"]
    D -->|Missing API account| G["Create verified user and account_admissions evidence"]
    E --> H["Find Alice and Bob; inspect Alice's team membership"]
    F --> H
    G --> H
    H --> I{"Alice owns Demo team?"}
    I -->|No| J["transaction: Team.create, createFirstMember Alice, grant Bob viewer"]
    I -->|Yes| K["transaction: add Bob as viewer only when no membership exists"]
```

**Code references:** [Hypermedia seeder](../../apps/hypermedia/database/seeders/demo_seeder.ts), [Masquerade operator configuration](../../apps/hypermedia/app/services/masquerade_operators.ts), [Soft-delete administrator configuration](../../apps/hypermedia/app/services/soft_delete_admins.ts), [Access Control configuration](../../apps/hypermedia/config/access_control.ts), [Demo seeder tests](../../apps/hypermedia/tests/functional/demo_seeder.spec.ts), [React seeder](../../apps/inertia-react/database/seeders/demo_seeder.ts), [Vue seeder](../../apps/inertia-vue/database/seeders/demo_seeder.ts), [API seeder](../../apps/api/database/seeders/demo_seeder.ts).
