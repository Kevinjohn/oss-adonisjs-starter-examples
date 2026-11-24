import type { ApplicationService } from '@adonisjs/core/types'
import AccountKitMasqueradeProvider from '@kevinjohn/adonisjs-masquerade/account-kit/provider'
import { readAuthStrategy } from '#services/auth_strategy'
import { nativeAdapter } from '#config/masquerade'

export default class MasqueradeNativeProvider {
  constructor(private app: ApplicationService) {}

  register(): void {
    this.app.container.bindValue('masquerade.native', nativeAdapter)
  }

  /** Validate the Account Kit bearer adapter when the API mounts Masquerade controls. */
  async ready(): Promise<void> {
    if (readAuthStrategy() === 'access_tokens') {
      await new AccountKitMasqueradeProvider(this.app).ready()
    }
  }
}
