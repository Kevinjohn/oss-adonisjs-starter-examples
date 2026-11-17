import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/notes', [() => import('#controllers/notes_controller'), 'index']).as('notes.index')
    router
      .post('/notes', [() => import('#controllers/notes_controller'), 'store'])
      .as('notes.store')
  })
  .use([middleware.accountKitBlocker(), middleware.auth({ guards: ['web'] })])
