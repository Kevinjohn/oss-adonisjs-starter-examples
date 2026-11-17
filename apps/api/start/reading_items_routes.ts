import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import { selectedGuardName } from '#services/auth_strategy'
import router from '@adonisjs/core/services/router'

router
  .group(() => {
    router.get('reading-items', [controllers.ReadingItems, 'index']).as('reading_items.index')
    router.post('reading-items', [controllers.ReadingItems, 'store']).as('reading_items.store')
  })
  .prefix('/api/v1/account')
  .use([middleware.auth({ guards: [selectedGuardName()] }), middleware.accountKitAccountBlocker()])
