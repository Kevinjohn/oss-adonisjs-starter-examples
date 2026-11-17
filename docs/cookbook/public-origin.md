# Validate the public origin

Set `APP_URL` to the bare origin users visit, such as `https://app.example.com`, without a trailing slash or path. Each app validates this setting with Origin Guard before using it for account links. In production, a public HTTP origin stops application boot. Local development can use `http://localhost:3333`.

[The origin configuration](../../apps/api/start/public_origin.ts) feeds both [Account Kit links](../../apps/api/config/account_kit.ts) and [social sign-in callbacks](../../apps/api/config/ally.ts) in the API app. The same configuration feeds the browser apps' account links. The [boot test](../../apps/api/tests/functional/public_origin.spec.ts) exercises the production setting in a separate process.
