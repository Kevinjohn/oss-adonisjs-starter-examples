/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'
import { allowMutation, sensitive } from '@kevinjohn/adonisjs-masquerade/http'

router.on('/').render('pages/home').as('home')

router
  .group(() => {
    router.get('signup', [controllers.NewAccount, 'create'])
    router.post('signup', [controllers.NewAccount, 'store'])

    router.get('login', [controllers.Session, 'create'])
    router.post('login', [controllers.Session, 'store'])
    router.get('forgot-password', [controllers.PasswordResets, 'create'])
    router.post('forgot-password', [controllers.PasswordResets, 'store'])
  })
  .use(middleware.guest())

router.get('verify-email/:token', [controllers.EmailVerifications, 'edit'])
router.post('verify-email/:token', [controllers.EmailVerifications, 'update'])
router.get('reset-password/:token', [controllers.PasswordResets, 'edit'])
router.post('reset-password/:token', [controllers.PasswordResets, 'update'])
router.get('confirm-email/:token', [controllers.EmailChanges, 'confirm'])
router.post('confirm-email/:token', [controllers.EmailChanges, 'complete'])

router
  .group(() => {
    router.get('dashboard', [controllers.Dashboard, 'show']).as('dashboard')
    router.post('email-verification', [controllers.EmailVerifications, 'store'])
    router.get('settings/profile', [controllers.Profile, 'edit'])
    router.post('settings/profile', [controllers.Profile, 'update'])
    router.get('settings/password', [controllers.Passwords, 'edit'])
    router.post('settings/password', [controllers.Passwords, 'update']).use(sensitive())
    router.get('settings/email', [controllers.EmailChanges, 'edit'])
    router.post('settings/email', [controllers.EmailChanges, 'store']).use(sensitive())
    router.post('settings/email/cancel', [controllers.EmailChanges, 'cancel'])
  })
  .use(middleware.auth())

router
  .get('account', [controllers.Dashboard, 'protected'])
  .as('account')
  .use([middleware.auth(), middleware.verified()])

// Logout stays on the raw `web` guard, so an operator can still sign out while masquerading.
router
  .post('logout', [controllers.Session, 'destroy'])
  .as('session.destroy')
  .use(middleware.auth({ guards: ['web'] }))

// Invitation links: create the account and join the team.
router.get('invitation/:token', [controllers.Invitations, 'edit'])
router.post('invitation/:token', [controllers.Invitations, 'update'])

router
  .group(() => {
    router.get('teams', [controllers.Teams, 'index']).as('teams.index')
    router.post('teams', [controllers.Teams, 'store']).as('teams.store')
  })
  .use([middleware.auth(), middleware.verified()])

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
    router
      .post('teams/:scopeId/invitations', [controllers.TeamInvitations, 'store'])
      .as('team_invitations.store')
  })
  .use([middleware.auth(), middleware.verified(), middleware.scope()])

router
  .group(() => {
    router.get('account/delete', [controllers.AccountDeletion, 'show']).as('account_deletion.show')
    router
      .post('account/delete', [controllers.AccountDeletion, 'destroy'])
      .as('account_deletion.destroy')
    router.get('admin/deleted-users', [controllers.DeletedUsers, 'index']).as('deleted_users.index')
    router
      .post('admin/deleted-users/:id/restore', [controllers.DeletedUsers, 'restore'])
      .as('deleted_users.restore')
  })
  .use(middleware.auth())
