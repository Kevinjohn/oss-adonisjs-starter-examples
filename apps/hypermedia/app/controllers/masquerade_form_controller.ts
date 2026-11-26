import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import { MasqueradeController } from '@kevinjohn/adonisjs-masquerade/http'
import { MasqueradeFormService } from '#services/masquerade_form_service'
import { startMasqueradeValidator, stopMasqueradeValidator } from '#validators/masquerade'

const accountsPath = '/masquerade/accounts'

/** Host-owned HTML form adapter. Edit redirect paths and flash handling for this application. */
@inject()
export default class MasqueradeFormController extends MasqueradeController {
  #form: MasqueradeFormService

  constructor(form: MasqueradeFormService) {
    super()
    this.#form = form
  }

  override async start({
    request,
    response,
    session,
    containerResolver,
  }: HttpContext): Promise<void> {
    if (!acceptsHtmlForm(request)) return super.start(await containerResolver.make(HttpContext))
    const [, form] = await request.tryValidateUsing(startMasqueradeValidator, {
      data: { body: request.body() },
      meta: { request },
    })

    setControlResponseHeaders(response)
    const outcome = await this.#form.transition('start', form?.body)
    session.flash({ masquerade: outcome })
    response.redirect().toPath(outcome.type === 'success' ? '/dashboard' : accountsPath)
  }

  override async stop({
    request,
    response,
    session,
    containerResolver,
  }: HttpContext): Promise<void> {
    if (!acceptsHtmlForm(request)) return super.stop(await containerResolver.make(HttpContext))
    const [, form] = await request.tryValidateUsing(stopMasqueradeValidator, {
      data: { body: request.body() },
      meta: { request },
    })

    setControlResponseHeaders(response)
    const outcome = await this.#form.transition('stop', form?.body)
    session.flash({ masquerade: outcome })
    response.redirect().toPath(accountsPath)
  }
}

function acceptsHtmlForm(request: HttpContext['request']): boolean {
  const accept = request.header('accept')
  const explicitlyAcceptsHtml = accept?.split(',').some((entry) => {
    const mediaType = entry.split(';', 1)[0]?.trim().toLowerCase()
    return mediaType === 'text/html' || mediaType === 'application/xhtml+xml'
  })
  return Boolean(explicitlyAcceptsHtml && request.accepts(['html', 'json']) === 'html')
}

function setControlResponseHeaders(response: HttpContext['response']): void {
  response.header('Cache-Control', 'private, no-store')
  response.vary(['Accept', 'X-Masquerade-Context'])
}
