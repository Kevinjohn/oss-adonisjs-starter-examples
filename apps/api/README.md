# api starter example

The official AdonisJS `api` starter kit with our packages, assembled by
[oss-adonisjs-starter-examples](https://github.com/Kevinjohn/oss-adonisjs-starter-examples).
Do not edit this folder by hand: change a package's example, then run `pnpm assemble`.

Base: [`adonisjs/starter-kits@46d235932e3eb6472a16b740fa0b47b5f69fc6fc`](https://github.com/adonisjs/starter-kits/tree/46d235932e3eb6472a16b740fa0b47b5f69fc6fc/api)

| Package                                 | Version | Example                                                                                                       |
| --------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `@kevinjohn/adonisjs-account-kit`       | 0.3.2   | [example](https://github.com/Kevinjohn/oss-adonisjs-account-kit/tree/v0.3.2/examples/api)                     |
| `@kevinjohn/adonisjs-masquerade`        | 0.2.5   | [example](https://github.com/Kevinjohn/oss-adonisjs-masquerade/tree/v0.2.5/examples/with_account_kit/api)     |
| `@kevinjohn/adonisjs-access-control`    | 0.1.5   | [example](https://github.com/Kevinjohn/oss-adonisjs-access-control/tree/v0.1.5/examples/with_account_kit/api) |
| `@kevinjohn/adonisjs-lucid-soft-delete` | 0.1.7   | [example](https://github.com/Kevinjohn/oss-adonisjs-lucid-soft-delete/tree/v0.1.7/examples/starter/api)       |

## Run it

```sh
pnpm install
cp .env.example .env
node ace generate:key
node ace migration:run
pnpm dev
```

## Combined interactions

See the sandbox's [API team request instructions](https://github.com/Kevinjohn/oss-adonisjs-starter-examples#api-team-requests)
for the bearer-token ability and context header required by the combined API app.
