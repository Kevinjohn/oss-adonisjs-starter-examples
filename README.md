# oss-adonisjs-starter-examples

The official [AdonisJS starter kits](https://github.com/adonisjs/starter-kits) with our AdonisJS
packages added, one app per kit. The API app combines Account Kit, Masquerade, Access Control, and
Soft Delete. Masquerade's API example uses Account Kit access tokens. Hypermedia, Inertia React and
Inertia Vue also combine these packages. Each package
repository keeps its own example apps; this repository reads them at their release tags, lets git
merge their changes onto the pinned starter kit, and commits the combined apps under `apps/`.

## Run an app

```sh
cd apps/<kit>
pnpm install
cp .env.example .env
node ace generate:key
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

## How it works

See [the specification](docs/specification.md) and [AGENTS.md](AGENTS.md).
