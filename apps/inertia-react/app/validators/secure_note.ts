import vine from '@vinejs/vine'

export const confirmSecureNoteValidator = vine.create({
  body: vine.string().minLength(1).maxLength(500),
  password: vine.string(),
})

export const saveSecureNoteValidator = vine.create({
  confirmationId: vine.string().minLength(1),
})
