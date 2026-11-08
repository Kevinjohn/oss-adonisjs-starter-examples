# Masquerade with Access Control

Team routes should resolve membership for the effective account, so an operator acting as a team member sees that account’s team pages and permissions. A team rename may opt into masquerade mutations, while invitations remain tied to the signed-in account and its raw membership.

## Resolve team membership for the effective account

The default guard is `web_effective`, so `middleware.auth()` authenticates as the masqueraded target when a mode is active. Then `scope` loads that account’s membership for `:scopeId` and refuses access if none exists; after masquerade stops, the operator needs their own membership.

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/start/routes.ts -->
```ts
// Teams send invitation email, so they need a confirmed address. `scope` runs after
// authentication: it loads the membership of `:scopeId`, or refuses with
// E_ACCESS_CONTROL_FORBIDDEN (403).
router
  .group(() => {
    router.get('teams/:scopeId', [controllers.Teams, 'show']).as('teams.show')
    // An operator masquerading with Can edit may rename a team the target can write.
    router
      .post('teams/:scopeId', [controllers.Teams, 'update'])
      .as('teams.update')
      .use(allowMutation())
  })
  .use([middleware.auth(), middleware.verified(), middleware.scope()])
```

<!-- prettier-ignore-end -->

## Keep team permissions in force

`allowMutation()` permits the rename during an editable masquerade; it does not grant team permission. Access Control authorizes `team:write` before saving, so only editors and higher can rename.

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/app/controllers/teams_controller.ts -->
```ts
  /** Renaming needs `team:write`: editors and above. */
  async update({ bouncer, params, request, response, session }: HttpContext) {
    await bouncer.authorize('team:write')
    const { name } = await request.validateUsing(teamValidator)
    const team = await Team.findOrFail(params.scopeId)
    team.name = name
    await team.save()
    session.flash('success', 'Team renamed.')
    return response.redirect().toRoute('teams.show', { scopeId: team.id })
  }
```

<!-- prettier-ignore-end -->

## Keep invitations on the raw account

Invitation routes deliberately select the raw `web` guard and run the scope middleware against that account’s membership. Account Kit sends the invitation as that raw actor; `accountKitBlocker()` prevents invitation work while masquerading.

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/start/routes.ts -->
```ts
// Invitations manage the signed-in account and use its raw membership.
router
  .post('teams/:scopeId/invitations', [controllers.TeamInvitations, 'store'])
  .as('team_invitations.store')
  .use([
    middleware.accountKitBlocker(),
    middleware.auth({ guards: ['web'] }),
    middleware.verified(),
    middleware.scope(),
  ])
```

<!-- prettier-ignore-end -->

<!-- prettier-ignore-start -->

<!-- source: apps/hypermedia/app/controllers/team_invitations_controller.ts -->
```ts
    const actor = auth.getUserOrFail()
    const { email, role } = await request.validateUsing(teamInvitationValidator)
    try {
      await kit.invitations.send({ actorId: actor.id, email, role, scope: String(params.scopeId) })
```

<!-- prettier-ignore-end -->

The Hypermedia, Inertia React and Inertia Vue apps use session-based effective guards; `apps/api` uses bearer tokens with the `masquerade` ability for scoped team reads and renames, and sends the `contextToken` from `GET /masquerade`, refreshed after mode changes, as `X-Masquerade-Context` on `PATCH` renames.
