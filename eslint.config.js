import { configPkg } from '@adonisjs/eslint-config'

export default configPkg({
  ignores: ['apps/**', 'resolutions/**', 'layers/**', 'tmp/**', 'build/**'],
})
