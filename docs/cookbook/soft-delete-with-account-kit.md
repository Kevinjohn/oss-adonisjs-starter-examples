# Soft Delete with Account Kit

The assembled Hypermedia app uses Account Kit for sign-in and Soft Delete to keep deleted user rows available for restoration. Inertia React and Inertia Vue render these session flows with Inertia; `apps/api` uses bearer tokens, `DELETE /api/v1/account` for self-deletion and JSON responses under `/api/v1/admin/deleted-users`.

## Compose the user model

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/app/models/user.ts -->
```ts
import { SoftDeletes } from '@kevinjohn/adonisjs-lucid-soft-delete'

export default class User extends compose(UserSchema, withAuthFinder(hash), SoftDeletes) {
```

<!-- prettier-ignore-end -->

`SoftDeletes` changes `user.delete()` into a soft deletion and excludes deleted rows from normal model queries. The app also supplies the nullable `deleted_at` column in `database/migrations/1758943359073_add_deleted_at_to_users.ts`.

## Protect self-deletion routes

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/start/routes.ts -->
```ts
// Self-deletion manages the native account, including its confirmation form.
router
  .group(() => {
    router.get('account/delete', [controllers.AccountDeletion, 'show']).as('account_deletion.show')
    router
      .post('account/delete', [controllers.AccountDeletion, 'destroy'])
      .as('account_deletion.destroy')
  })
  .use([middleware.accountKitBlocker(), middleware.auth({ guards: ['web'] })])
```

<!-- prettier-ignore-end -->

`GET /account/delete` shows the confirmation form; `POST /account/delete` deletes the signed-in account. Both use the raw `web` guard and the Account Kit blocker, so neither is available during masquerade.

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/app/controllers/account_deletion_controller.ts -->
```ts
  async destroy({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    await user.delete()
    await auth.use('web').logout()
    return response.redirect().toRoute('session.create')
  }
```

<!-- prettier-ignore-end -->

The controller calls the model directly, logs out of `web` and redirects to the login page.

## Expose deleted-account administration

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/start/routes.ts -->
```ts
router
  .group(() => {
    router.get('admin/deleted-users', [controllers.DeletedUsers, 'index']).as('deleted_users.index')
    router
      .post('admin/deleted-users/:id/restore', [controllers.DeletedUsers, 'restore'])
      .as('deleted_users.restore')
  })
  .use(middleware.auth())
```

<!-- prettier-ignore-end -->

`GET /admin/deleted-users` lists deleted accounts with `User.onlyTrashed()`, most recently deleted first; `POST /admin/deleted-users/:id/restore` restores one. Both controller actions check `isSoftDeleteAdmin`, which compares the account's email exactly against `SOFT_DELETE_ADMIN_EMAILS`; non-administrators receive 403.

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/app/controllers/deleted_users_controller.ts -->
```ts
  async restore({ auth, params, response, session }: HttpContext) {
    if (!isSoftDeleteAdmin(auth.getUserOrFail())) return response.forbidden(refusal)
    const user = await User.onlyTrashed().where('id', params.id).firstOrFail()
    await user.restore()
    session.flash('success', `${user.email} is restored.`)
    return response.redirect().toRoute('deleted_users.index')
  }
```

<!-- prettier-ignore-end -->

Restoration selects only deleted rows and makes the account visible to normal queries again; the combined tests confirm that the same credentials then work.

## Reject sign-in while deleted

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/config/account_kit.ts -->
```ts
const users = createLucidAdapter(loadUser, {
  mapRegistrationData(data, user) {
    user.fullName = fullNameFrom(data)
  },
})
```

<!-- prettier-ignore-end -->

`loadUser` loads this `User` model, and `SessionController.store` calls `kit.authentication.login` through this adapter. The adapter's normal Lucid lookup inherits the model's Soft Delete query filter, so a deleted account is not found and login fails with invalid credentials; Hypermedia displays its usual incorrect-email-or-password message. This is enforced by the model query filter, not `authentication.canAccess`, which returns `true` in this app.
