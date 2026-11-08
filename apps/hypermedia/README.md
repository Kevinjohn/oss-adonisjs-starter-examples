# hypermedia starter example

The official AdonisJS `hypermedia` starter kit with our packages, assembled by
[oss-adonisjs-starter-examples](https://github.com/Kevinjohn/oss-adonisjs-starter-examples).
Do not edit this folder by hand: change a package's example, then run `pnpm assemble`.

Base: [`adonisjs/starter-kits@46d235932e3eb6472a16b740fa0b47b5f69fc6fc`](https://github.com/adonisjs/starter-kits/tree/46d235932e3eb6472a16b740fa0b47b5f69fc6fc/hypermedia)

| Package                                 | Version | Example                                                                                                              |
| --------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `@kevinjohn/adonisjs-account-kit`       | 0.3.2   | [example](https://github.com/Kevinjohn/oss-adonisjs-account-kit/tree/v0.3.2/examples/hypermedia)                     |
| `@kevinjohn/adonisjs-masquerade`        | 0.2.5   | [example](https://github.com/Kevinjohn/oss-adonisjs-masquerade/tree/v0.2.5/examples/with_account_kit/hypermedia)     |
| `@kevinjohn/adonisjs-access-control`    | 0.1.5   | [example](https://github.com/Kevinjohn/oss-adonisjs-access-control/tree/v0.1.5/examples/with_account_kit/hypermedia) |
| `@kevinjohn/adonisjs-lucid-soft-delete` | 0.1.7   | [example](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/tree/v0.1.7/examples/starter/hypermedia)       |

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

Every new demo account uses the password `DemoPassword123!` and has a verified email. The API
accounts also have approved admission. Running the seeder again skips existing accounts,
preserving their passwords and account state.

| Account                   | Email                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Masquerade operator       | First address in `MASQUERADE_OPERATOR_EMAILS`: `operator@example.test` for API, `operator@example.com` for browser kits |
| Soft-delete administrator | First address in `SOFT_DELETE_ADMIN_EMAILS` (default: `admin@example.com`)                                              |
| Alice, team owner         | `alice@example.com`                                                                                                     |
| Bob, team viewer          | `bob@example.com`                                                                                                       |

Keep both email settings non-empty to seed the operator and administrator. Use lowercase
addresses in both settings to match sign-in normalization. Alice owns **Demo team**, with
Bob as a viewer.

### Browser kits

For `hypermedia`, `inertia-react` and `inertia-vue`, open `/login` on the local server. The `api`
kit has no pages; use the [API section](#api) instead.

1. Sign in as Alice, open `/teams`, and select **Demo team** to see Alice and Bob's roles.
2. Sign out, sign in as the operator, and open `/masquerade/accounts`. Choose **Can edit** and
   start masquerading as Alice. Open the team's URL from step 1 directly; team listing is
   blocked during masquerade. Try renaming the team, then stop masquerading before switching accounts.
3. Sign in as Bob, open `/account/delete`, and confirm deletion. His account can no longer sign in.
4. Sign in as the administrator, open `/admin/deleted-users`, and restore Bob. Sign in as Bob again.

### API

Use the default access-token configuration. Send `POST /api/v1/auth/login` with JSON
`{"email":"alice@example.com","password":"DemoPassword123!"}`. The response's `data.token`
is the bearer token for subsequent requests. Log in separately for each account below.

To find the seeded IDs without assuming an empty database, run `node ace repl` and enter:

```js
const { default: User } = await import('#models/user')
await User.query().select('id', 'email')
const { default: Team } = await import('#models/team')
await Team.query().select('id', 'name')
```

1. With Alice's bearer token, read `GET /api/v1/teams/<team-id>` for **Demo team**.
2. With the operator's bearer token, read `GET /masquerade`. Send its `contextToken` as
   `X-Masquerade-Context` on `POST /masquerade/start`, with JSON
   `{"targetId":"<alice-id>","access":"edit"}`. Read the team as Alice, then refresh the
   context with `GET /masquerade` and use it on `POST /masquerade/stop`.
3. With Bob's own bearer token, send `DELETE /api/v1/account` to soft-delete his account.
4. With the administrator's bearer token, read `GET /api/v1/admin/deleted-users`, then send
   `POST /api/v1/admin/deleted-users/<bob-id>/restore`. Bob can sign in again.

## Combined interactions

See the sandbox's [API team request instructions](https://github.com/Kevinjohn/oss-adonisjs-starter-examples#api-team-requests)
for the bearer-token ability and context header required by the combined API app.
