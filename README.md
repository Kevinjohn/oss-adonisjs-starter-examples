# oss-adonisjs-starter-examples

The official [AdonisJS starter kits](https://github.com/adonisjs/starter-kits) with our AdonisJS
packages added, one app per kit. The four supported kits are API, Hypermedia, Inertia React, and
Inertia Vue. The Inertia Vue example currently comes from Account Kit only. Each package repository
keeps its own example apps; this repository reads them at their release tags, lets git merge their
changes onto the pinned starter kit, and commits the combined apps under `apps/`.

## Run an app

```sh
cd apps/<kit>
pnpm install
cp .env.example .env
node ace generate:key
node ace migration:run
pnpm dev
```

## How it works

See [the specification](docs/specification.md) and [AGENTS.md](AGENTS.md).
