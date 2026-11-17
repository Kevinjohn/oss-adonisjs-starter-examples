# inertia-vue starter example

The official AdonisJS `inertia-vue` starter kit with our packages, assembled by
[oss-adonisjs-starter-examples](https://github.com/Kevinjohn/oss-adonisjs-starter-examples).
Do not edit this folder by hand: change a package's example, then run `pnpm assemble`.

Base: [`adonisjs/starter-kits@46d235932e3eb6472a16b740fa0b47b5f69fc6fc`](https://github.com/adonisjs/starter-kits/tree/46d235932e3eb6472a16b740fa0b47b5f69fc6fc/inertia-vue)

| Package                                 | Version | Example                                                                                                               |
| --------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `@kevinjohn/adonisjs-account-kit`       | 0.4.0   | [example](https://github.com/Kevinjohn/oss-adonisjs-account-kit/tree/v0.4.0/examples/inertia-vue)                     |
| `@kevinjohn/adonisjs-masquerade`        | 0.4.0   | [example](https://github.com/Kevinjohn/oss-adonisjs-masquerade/tree/v0.4.0/examples/with_account_kit/inertia_vue)     |
| `@kevinjohn/adonisjs-access-control`    | 0.2.0   | [example](https://github.com/Kevinjohn/oss-adonisjs-access-control/tree/v0.2.0/examples/with_account_kit/inertia_vue) |
| `@kevinjohn/adonisjs-lucid-soft-delete` | 0.2.0   | [example](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/tree/v0.2.0/examples/starter/inertia_vue)       |

## Run it

```sh
pnpm install
cp .env.example .env
node ace generate:key
node ace migration:run
pnpm dev
```

## Try it

After running the migrations, seed the demo data from the app directory (use another terminal
if the development server is running):

```sh
node ace db:seed
```

Seeded demo accounts use the password `DemoPassword123!` and have verified emails. Running the
seeder again skips accounts that exist. The seeder does not grant deleted-account administration.

| Account             | Email                                                                           |
| ------------------- | ------------------------------------------------------------------------------- |
| Masquerade operator | First address in `MASQUERADE_OPERATOR_EMAILS` (default: `operator@example.com`) |
| Alice, team owner   | `alice@example.com`                                                             |
| Bob, team viewer    | `bob@example.com`                                                               |

Alice owns **Demo team**, with Bob as a viewer.

### Browser kits

For `hypermedia`, `inertia-react` and `inertia-vue`, open `/login` on the local server. The `api`
kit has no pages; use the [API section](#api) instead.

1. Sign in as Alice, open `/teams`, and select **Demo team** to see Alice and Bob's roles.
2. Sign out, sign in as the operator, and open `/masquerade/accounts`. Choose **Can edit** and
   start masquerading as Alice. Open the team's URL from step 1 directly; team listing is
   blocked during masquerade. Try renaming the team, then stop masquerading before switching accounts.
3. Sign in as Bob, open `/account/delete`, and confirm deletion. His account can no longer sign in.
4. Grant a separate existing verified account deleted-account administration through a trusted database operation by setting its `is_soft_delete_admin` field to true. Sign in as that account, open `/admin/deleted-users`, and restore Bob. Sign in as Bob again.

### API

Use the default access-token configuration. Send `POST /api/v1/auth/login` with JSON
`{"email":"alice@example.com","password":"DemoPassword123!"}`. The response's `data.token`
is the bearer token for subsequent requests. Log in separately for each account below.

Use the IDs returned by the app for Alice, Bob and **Demo team**; they depend on existing data.

1. With Alice's bearer token, read `GET /api/v1/teams/<team-id>` for **Demo team**.
2. With the operator's bearer token, read `GET /masquerade`. Send its `contextToken` as
   `X-Masquerade-Context` on `POST /masquerade/start`, with JSON
   `{"targetId":"<alice-id>","access":"edit"}`. Read the team as Alice, then refresh the
   context with `GET /masquerade` and use it on `POST /masquerade/stop`.
3. With Bob's own bearer token, send `DELETE /api/v1/account` to soft-delete his account.
4. Grant a separate existing verified account deleted-account administration through a trusted database operation by setting its `is_soft_delete_admin` field to true. With that account's bearer token, read `GET /api/v1/admin/deleted-users`, then send
   `POST /api/v1/admin/deleted-users/<bob-id>/restore`. Bob can sign in again.

## Combined interactions

See the sandbox's [API team request instructions](https://github.com/Kevinjohn/oss-adonisjs-starter-examples#api-team-requests)
for the bearer-token ability and context header required by the combined API app.
