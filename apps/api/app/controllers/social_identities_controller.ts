import type { HttpContext } from '@adonisjs/core/http'
import { E_ACCOUNT_KIT_INVALID_INPUT } from '@kevinjohn/adonisjs-account-kit'
import accountKit from '@kevinjohn/adonisjs-account-kit/services/main'
import { readAccountInput } from '#middleware/account_access_middleware'
import { passwordProofValidator, socialUnlinkValidator } from '#validators/social'

function requireIdentityIdParam(value: string): number {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new E_ACCOUNT_KIT_INVALID_INPUT('Invalid identity ID')
  return id
}

export default class SocialIdentitiesController {
  async provePassword({ auth, session, response, request }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const { password, purpose } = await request.validateUsing(passwordProofValidator)
    const proof = await accountKit.socialAuthentication.provePassword({
      current: readAccountInput({ auth, session }),
      password,
      purpose,
    })
    return response.ok({ proof })
  }

  async unlink({ auth, session, request, params, response }: HttpContext) {
    const { proof } = await request.validateUsing(socialUnlinkValidator)
    await accountKit.socialAuthentication.unlink({
      current: readAccountInput({ auth, session }),
      identityId: requireIdentityIdParam(params.id),
      proof,
    })
    return response.noContent()
  }
}
