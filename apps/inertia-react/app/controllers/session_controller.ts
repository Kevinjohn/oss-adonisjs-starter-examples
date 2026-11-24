import kit from '@kevinjohn/adonisjs-account-kit/services/main'
import { loginValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'

export default class SessionController {
  async create({ inertia }: HttpContext) {
    return inertia.render('auth/login', {})
  }

  async store(ctx: HttpContext) {
    const { email, password } = await ctx.request.validateUsing(loginValidator)
    await kit.authentication.login(
      { email, password, clientKey: ctx.request.ip() },
      ctx.auth.use('web').forRequest()
    )
    ctx.session.flash('masqueradeClearHistory', true)
    return ctx.response.redirect().toRoute('dashboard')
  }

  async destroy(ctx: HttpContext) {
    await kit.authentication.logout(
      ctx.auth.use('web').forRequest(),
      undefined,
      await ctx.auth.use('web').current()
    )
    ctx.session.flash('masqueradeClearHistory', true)
    return ctx.response.redirect().toRoute('session.create')
  }
}
