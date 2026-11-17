# Working on Starter Examples

Use Node 24 and pnpm 11.23.0. Install root tooling with `pnpm install --frozen-lockfile`.

Edit the runnable examples under `apps/api`, `apps/hypermedia`, `apps/inertia-react` and
`apps/inertia-vue` here. Each app owns its manifest, frozen lockfile and integration tests.
Keep shared recipes in `docs/cookbook/` and source their code snippets from the committed apps.

Run `pnpm check` for root tooling and documentation. Run `pnpm test:app --kit <kit>` for each
affected app. On a fresh browser-test host, add `--install-browsers`. The runner uses a
disposable copy so migrations, generated files and test data stay outside the source app.

Each release tag selects all four apps together. Record the package versions and app changes
in the changelog and link the tagged apps and recipes from the release notes.
