import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/settings/secure-note', [controllers.SecureNotes, 'edit']).as('secure_notes.edit')
    router
      .post('/settings/secure-note/confirm', [controllers.SecureNotes, 'confirm'])
      .as('secure_notes.confirm')
    router
      .post('/settings/secure-note', [controllers.SecureNotes, 'update'])
      .as('secure_notes.update')
  })
  .use([middleware.accountKitBlocker(), middleware.auth({ guards: ['web'] })])
