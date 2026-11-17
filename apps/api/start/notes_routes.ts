import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { selectedGuardName } from '#services/auth_strategy'

router
  .post('/api/v1/notes', [() => import('#controllers/notes_controller'), 'store'])
  .as('notes.store')
  .use([
    middleware.auth({ guards: [selectedGuardName()] }),
    middleware.admittedAccount(),
    middleware.accountKitAccountBlocker(),
  ])
