import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'

router
  .group(() => {
    router.get('/reading-items', [controllers.ReadingItems, 'index']).as('reading_items.index')
    router.post('/reading-items', [controllers.ReadingItems, 'store']).as('reading_items.store')
  })
  .use([middleware.accountKitBlocker(), middleware.auth({ guards: ['web'] })])
