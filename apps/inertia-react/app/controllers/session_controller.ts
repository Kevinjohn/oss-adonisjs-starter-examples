import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import { loginValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'

export default class SessionController {
  async create({ inertia }: HttpContext) {
    return inertia.render('auth/login', {})
  }

  async store({ request, auth, session, response }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)
    await kit.authentication.login(
      { email, password, clientKey: request.ip() },
      auth.use('web').forRequest()
    )
    session.flash('masqueradeClearHistory', true)
    return response.redirect().toRoute('dashboard')
  }

  async destroy({ auth, session, response }: HttpContext) {
    await kit.authentication.logout(
      auth.use('web').forRequest(),
      undefined,
      await auth.use('web').current()
    )
    session.flash('masqueradeClearHistory', true)
    return response.redirect().toRoute('session.create')
  }
}
