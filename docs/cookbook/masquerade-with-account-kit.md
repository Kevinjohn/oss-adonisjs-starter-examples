# Masquerade with Account Kit

When Masquerade is combined with Account Kit, register its account blocker and apply it to routes that manage the signed-in account. The blocker refuses these sensitive actions while a mode is active, including edit mode.

## Register the blocker

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/start/kernel.ts -->
```ts
  accountKitBlocker: () =>
    import('@kevinjohn/adonisjs-masquerade/account-kit/middleware').then((module) => ({
      default: module.AccountKitAccountBlocker,
    })),
```

<!-- prettier-ignore-end -->

Register this named middleware in the kernel so route groups can apply the Account Kit-aware blocker.

## Protect Account Kit routes

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/start/routes.ts -->
```ts
router
  .group(() => {
    router.post('email-verification', [controllers.EmailVerifications, 'store'])
    router.get('settings/profile', [controllers.Profile, 'edit'])
    router.post('settings/profile', [controllers.Profile, 'update'])
    router.get('settings/password', [controllers.Passwords, 'edit'])
    router.post('settings/password', [controllers.Passwords, 'update'])
    router.get('settings/email', [controllers.EmailChanges, 'edit'])
    router.post('settings/email', [controllers.EmailChanges, 'store'])
    router.post('settings/email/cancel', [controllers.EmailChanges, 'cancel'])
  })
  .use([middleware.accountKitBlocker(), middleware.auth({ guards: ['web'] })])
```

<!-- prettier-ignore-end -->

Apply the blocker and raw `web` authentication to account settings and other Account Kit operations. The combined specs confirm that protected actions return 403 in view mode and that team creation is also refused in edit mode.

## Keep logout on the raw guard

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/start/routes.ts -->
```ts
// Logout stays on the raw `web` guard, so an operator can still sign out while masquerading.
router
  .post('logout', [controllers.Session, 'destroy'])
  .as('session.destroy')
  .use(middleware.auth({ guards: ['web'] }))
```

<!-- prettier-ignore-end -->

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/app/controllers/session_controller.ts -->
```ts
  async destroy(ctx: HttpContext) {
    await kit.authentication.logout(accountKitSessionGuard(ctx))
    return ctx.response.redirect().toRoute('session.create')
  }
```

<!-- prettier-ignore-end -->

Keep logout outside the blocker group; Account Kit’s session guard wraps the raw `web` guard, so an operator can end their own session during masquerade.

## Preserve middleware order

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/start/kernel.ts -->
```ts
router.use([
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/session/session_middleware'),
  () => import('@adonisjs/auth/initialize_auth_middleware'),
  () => import('#middleware/masquerade_context_middleware'),
  () => import('#middleware/silent_auth_middleware'),
  () => import('#middleware/share_masquerade_status_middleware'),
  () => import('#middleware/session_revision_middleware'),
  () => import('@adonisjs/shield/shield_middleware'),
  () => import('#middleware/initialize_bouncer_middleware'),
])
```

<!-- prettier-ignore-end -->

`masquerade_context` runs after auth is initialised, so the request's Masquerade context is set before any route middleware or handler runs.

`apps/inertia-react` and `apps/inertia-vue` use the same session guards and blocker as Hypermedia; `apps/api` uses bearer tokens, names its blocker `accountKitAccountBlocker` and keeps account routes on the raw Account Kit guard.
