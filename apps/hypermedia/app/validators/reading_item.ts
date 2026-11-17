import vine from '@vinejs/vine'

export const readingItemValidator = vine.create({
  title: vine.string().trim().minLength(1).maxLength(200),
  label: vine.enum(['work', 'personal', 'reference']),
})
