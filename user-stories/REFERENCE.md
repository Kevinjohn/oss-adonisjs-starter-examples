# Catalogue reference

## Source baseline and scope

Fetched `origin/main` baseline: [`0317807ef03d27baa06a7dbdfeee9fd3593aa6d3`](https://github.com/Kevinjohn/oss-adonisjs-starter-examples/commit/0317807ef03d27baa06a7dbdfeee9fd3593aa6d3). Inventory covers four generated kits (`api`, `hypermedia`, `inertia-react`, `inertia-vue`), their routes, pages, controllers, validators, guards and tests, linked cookbooks, demo seeders, sandbox commands and assembly specification.

## Roles and boundaries

- **Application visitor/account owner:** registers, authenticates, manages their native account, joins teams and controls their own credentials.
- **Team member/editor/inviter:** acts with the Access Control membership and permission resolved for the account authenticated on that route.
- **Configured support operator:** account listed by the kit's Masquerade configuration; host `canMasquerade` policy and, for edit, `canEdit` must approve. The target's normal business permission still applies.
- **Soft-delete administrator:** address listed by `SOFT_DELETE_ADMIN_EMAILS`; route guard determines which account is checked.
- **App operator:** runs migrations, development server and optional demo seeder for one kit.
- **Sandbox maintainer:** assembles, resolves, checks, tests or rebases generated package examples.

Roles summarize actual config, route and policy checks; they do not imply a package-wide application role system. Host authentication, mail delivery, database, deployment, policy, scheduler and email environment values remain host-owned. Browser examples use Account Kit `createLogNotifications`: links go to the server log in development, and the apps refuse production boot until a host mailer is configured. The API adapter records notifications in process memory and logs proof links in development; production delivery requires a host integration. As supplied, none of these adapters sends real inbox email.

## Proof delivery boundary

The supplied adapters do not send real inbox email. Browser development runs use `createLogNotifications`, which puts proof URLs in the server output; its production mode refuses boot until the host replaces that integration. See the [Hypermedia configuration](../apps/hypermedia/config/account_kit.ts), [React configuration](../apps/inertia-react/config/account_kit.ts) and [Vue configuration](../apps/inertia-vue/config/account_kit.ts) for the actual notification selection and test seams.

The API [createNotify adapter](../apps/api/config/account_kit_notifications.ts) calls [notifications.send](../apps/api/app/services/account_kit_notifications.ts), which appends notices, including proof-link values, to process-memory `notifications.events`. In development it additionally logs those values. The array is application/test state, not an inbox or a durable delivery queue, and is not a public link-retrieval endpoint. Production API delivery needs a host notification integration.

Signup, reset, verification, email-change and invitation acknowledgements retain their actual UI wording; “sent” or “check your email” in that wording does not establish inbox delivery. In the supplied development examples obtain proof links from the server output; tests can inspect their configured notification records. Opening or submitting a proof link remains the separate token journey documented by its story.

## Availability and evidence

- **Current:** route or command exists subject to the stated guard, config, middleware and policy.
- **Operator:** local setup, sandbox or maintenance operation outside app user screens.
- **Demo:** seeder or walkthrough only.
- Hidden, Removed and Planned are used only when a repository source or accepted decision establishes those states.

Current is source availability, not a runtime result. No app journeys were run for this prose catalogue. Test links identify inspected evidence locations only.

## Kit boundaries and source map

| Kit             | Route and transport source                                                                                             | Action implementation                                                                                                                       | Tests and distinctive behavior                                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hypermedia`    | [routes](../apps/hypermedia/start/routes.ts), [Masquerade routes](../apps/hypermedia/start/masquerade_routes.ts)       | [Account controllers](../apps/hypermedia/app/controllers), [team controllers](../apps/hypermedia/app/controllers/teams_controller.ts)       | [Browser account journey](../apps/hypermedia/tests/browser/account_journey.spec.ts), [browser teams](../apps/hypermedia/tests/browser/teams.spec.ts); Edge forms and session guard                             |
| `inertia-react` | [routes](../apps/inertia-react/start/routes.ts), [Masquerade routes](../apps/inertia-react/start/masquerade_routes.ts) | [Account controllers](../apps/inertia-react/app/controllers), [team controllers](../apps/inertia-react/app/controllers/teams_controller.ts) | [browser account journeys](../apps/inertia-react/tests/browser/account_journeys.spec.ts), [browser teams](../apps/inertia-react/tests/browser/teams.spec.ts); React pages                                      |
| `inertia-vue`   | [routes](../apps/inertia-vue/start/routes.ts), [Masquerade routes](../apps/inertia-vue/start/masquerade_routes.ts)     | [Account controllers](../apps/inertia-vue/app/controllers), [team controllers](../apps/inertia-vue/app/controllers/teams_controller.ts)     | [browser account journeys](../apps/inertia-vue/tests/browser/account_journeys.spec.ts), [browser teams](../apps/inertia-vue/tests/browser/teams.spec.ts); Vue pages                                            |
| `api`           | [routes](../apps/api/start/routes.ts), [Masquerade control integration](../apps/api/start/masquerade_routes.ts)        | [Account controllers](../apps/api/app/controllers), [team controller](../apps/api/app/controllers/teams_controller.ts)                      | [API account signup/login](../apps/api/tests/functional/account_signup_login.spec.ts), [API teams](../apps/api/tests/functional/teams.spec.ts); `authStrategy()` selects session or token strategy in this kit |

The browser kits use session authentication. The API kit's `authStrategy()` selects session or bearer-token behavior for its selected account routes. The API Masquerade sample business routes `/api/v1/masquerade/account` and `/api/v1/masquerade/sensitive` independently use `api_effective` in either strategy; Masquerade controls authenticate the operator with the raw bearer guard. The API sample provides an [effective-identity read and sensitive-action refusal/success example](api/us-api-22-read-masquerade-sample.md). In API access-token mode, Masquerade control routes require the `masquerade` token ability and unsafe requests enforce the current `X-Masquerade-Context`, including while idle; a safe read does not require that header. Browser kits check context on unsafe effective requests, including while idle, but configure enforcement as `report`, so a mismatch is reported rather than refused solely for that reason. Browser kits keep the raw session credential with the actor; rendered forms carry context and host CSRF fields.

All four kits include Account Kit, Masquerade, Access Control and Soft Delete integration. Effective team routes resolve the selected account's membership and permission. Account management, self-deletion and native logout use the raw account identity or Account Kit blocker where configured. Exact route differences and fields are in the individual stories.

## API capability source map

The API stories link the exact handler and evidence for each action. This map groups the route families by their shared source boundaries:

| Story group                                                                                             | Route and policy boundary                                                                                                                        | Handler and supporting evidence                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-API-01](api/us-api-01-sign-out.md)–[US-API-03](api/us-api-03-read-sign-in-methods.md)               | [API routes](../apps/api/start/routes.ts), `authStrategy()`, selected raw guard, Account Kit blocker, account-access middleware                  | [Session controller](../apps/api/app/controllers/session_controller.ts), [token controller](../apps/api/app/controllers/access_tokens_controller.ts), [auth-method controller](../apps/api/app/controllers/auth_methods_controller.ts), [CSRF/session tests](../apps/api/tests/functional/reference_session.spec.ts)                          |
| [US-API-04](api/us-api-04-social-sign-in.md)–[US-API-10](api/us-api-10-unlink-provider.md)              | [Public auth and social route groups](../apps/api/start/routes.ts), configured provider adapters, social rate limits, actor-bound account access | [Social auth controller](../apps/api/app/controllers/social_auth_controller.ts), [social identity controller](../apps/api/app/controllers/social_identities_controller.ts), [OAuth token controller](../apps/api/app/controllers/oauth_token_controller.ts), [social functional tests](../apps/api/tests/functional/social_reference.spec.ts) |
| [US-API-11](api/us-api-11-list-invitations.md)–[US-API-13](api/us-api-13-revoke-invitation.md)          | [Invitation routes](../apps/api/start/routes.ts), verified-account gate, selected guard and invitation policy callbacks                          | [Invitations controller](../apps/api/app/controllers/invitations_controller.ts), [invitation validators](../apps/api/app/validators/account_kit.ts), [invitation functional tests](../apps/api/tests/functional/account_invitations.spec.ts)                                                                                                  |
| [US-API-14](api/us-api-14-read-admission.md)–[US-API-19](api/us-api-19-revoke-admission.md)             | [Admission routes](../apps/api/start/routes.ts); status/request remain reachable while pending, decisions require admitted account               | [Admissions controller](../apps/api/app/controllers/admissions_controller.ts), [admission functional tests](../apps/api/tests/functional/admission.spec.ts)                                                                                                                                                                                   |
| [US-API-20](api/us-api-20-read-protected-reports.md)–[US-API-21](api/us-api-21-read-account-profile.md) | [Reports and profile routes](../apps/api/start/routes.ts), account-access/blocker and admission policy as applied per route                      | [Reports controller](../apps/api/app/controllers/reports_controller.ts), [profile controller](../apps/api/app/controllers/profile_controller.ts), [access inspection tests](../apps/api/tests/functional/account_access_inspection.spec.ts)                                                                                                   |

The group links above identify the index entries; each linked story records its concrete route, inputs, result and code references. API authentication strategy is conditional configuration, not a second independent account type.

The browser [protected account page](accounts/us-account-14-open-protected-account.md) is separate from the dashboard in all three kits; the [theme preference](accounts/us-account-13-change-theme-preference.md) is a JavaScript-driven cookie preference exposed only by Hypermedia and React.

## Demo and operator source map

- Demo app README and run commands: [Hypermedia app README](../apps/hypermedia/README.md).
- Persistent demo data: browser-kit seeders create missing users and team fixtures; the [API seeder](../apps/api/database/seeders/demo_seeder.ts) also writes invitation-source and approved admission evidence only for newly created users. Existing API users are skipped without those rows. The kit-specific seeders are linked from [US-DEMO-01](demo/us-demo-01-seed-demo-data.md).
- Sandbox command entry points: [assemble](../bin/assemble.ts), [resolve](../bin/resolve.ts), [app test](../bin/test_app.ts), [layer rebase](../bin/rebase_layer.ts), [release version recording](../bin/set_versions.ts).
- Accepted sandbox composition and release workflow: [assembly specification](../docs/specification.md).

Assembly and operator details are source-reviewed contracts. The docs do not claim that any runtime app or command was exercised as part of this catalogue.
