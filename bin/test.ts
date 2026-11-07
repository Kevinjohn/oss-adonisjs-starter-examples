import { assert } from '@japa/assert'
import { configure, processCLIArgs, run } from '@japa/runner'

processCLIArgs(process.argv.splice(2))

configure({
  files: ['tests/**/*.spec.ts'],
  // Specs build real git repositories, which can exceed Japa's 2s default on a busy machine.
  timeout: 30_000,
  plugins: [assert()],
})

run()
