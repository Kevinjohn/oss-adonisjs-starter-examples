import vine from '@vinejs/vine'

export const createNoteValidator = vine.create({
  body: vine.string().regex(/\S/),
  commandId: vine.string().minLength(1),
  requestKey: vine.string().minLength(1),
})
