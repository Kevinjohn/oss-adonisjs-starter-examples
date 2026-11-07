# hypermedia starter example

The official AdonisJS `hypermedia` starter kit with our packages, assembled by
[oss-adonisjs-starter-examples](https://github.com/Kevinjohn/oss-adonisjs-starter-examples).
Do not edit this folder by hand: change a package's example, then run `pnpm assemble`.

Base: [`adonisjs/starter-kits@46d235932e3eb6472a16b740fa0b47b5f69fc6fc`](https://github.com/adonisjs/starter-kits/tree/46d235932e3eb6472a16b740fa0b47b5f69fc6fc/hypermedia)

| Package                              | Version | Example                                                                                                              |
| ------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `@kevinjohn/adonisjs-account-kit`    | 0.3.1   | [example](https://github.com/Kevinjohn/oss-adonisjs-account-kit/tree/v0.3.1/examples/hypermedia)                     |
| `@kevinjohn/adonisjs-masquerade`     | 0.2.2   | [example](https://github.com/Kevinjohn/oss-adonisjs-masquerade/tree/v0.2.2/examples/with_account_kit/hypermedia)     |
| `@kevinjohn/adonisjs-access-control` | 0.1.3   | [example](https://github.com/Kevinjohn/oss-adonisjs-access-control/tree/v0.1.3/examples/with_account_kit/hypermedia) |

## Run it

```sh
pnpm install
cp .env.example .env
node ace generate:key
node ace migration:run
pnpm dev
```
