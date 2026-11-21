# oss-adonisjs-starter-examples

Four runnable AdonisJS apps show how Account Kit, Masquerade, Access Control and Lucid Soft Delete
work together. The [API](apps/api) uses bearer tokens. [Hypermedia](apps/hypermedia),
[React](apps/inertia-react) and [Vue](apps/inertia-vue) use browser sessions.

All four apps validate their public origin, create replay-safe notes, and store checked JSON labels
on reading-list entries. The three session apps also demonstrate one-use password confirmation for a
secure note. Edit the apps here and find the setup and tested journeys in [the cookbook](docs/cookbook/README.md).

## Run an app

```sh
cd apps/<kit>
pnpm install --frozen-lockfile
cp .env.example .env
node ace generate:key
node ace codegen
node ace migration:run
pnpm dev
```

## API team requests

The API example uses bearer tokens with the `masquerade` ability (included in the login endpoint's
full-access tokens) for team routes. Read `GET /masquerade` with the same bearer token and send its
`contextToken` as `X-Masquerade-Context` on team writes, including while idle. Refresh the context
after starting or stopping masquerade. Team membership follows the effective account; account
management and deleted-account administration routes retain their raw Account Kit guard (Masquerade
issue #311).

## Cookbook

[The cookbook](docs/cookbook/README.md) explains how the packages are combined, with code taken
from these apps.

## Choose and test a release

Check out a release tag, then select one of the four app directories. Each has its own manifest
and lockfile. A tag selects the entire tested package set. For example, to run the API checks
from the root of a checkout of this release:

```sh
pnpm install --frozen-lockfile
pnpm test:app --kit api
```

For a browser app, pass its kit name and add `--install-browsers` on a fresh machine.
To adopt a package release, update the intended apps and their lockfiles, run the app checks,
and record the verified set in the next Starter Examples release.

## User story catalogue

See the [source-reviewed user story catalogue](user-stories/README.md) for capability coverage and code-backed action flows.
