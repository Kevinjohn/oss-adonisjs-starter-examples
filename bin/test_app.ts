import { parseArgs } from 'node:util'
import { testApp, waitForUrl } from '../src/app_test.ts'
import { SANDBOX_ROOT, runCli } from '../src/cli.ts'
import { processRunner } from '../src/command_runner.ts'
import { SandboxError } from '../src/errors.ts'

/**
 * pnpm test:app --kit <kit> [--dir apps] [--install-browsers]
 */
runCli(async () => {
  const { values } = parseArgs({
    options: {
      'kit': { type: 'string' },
      'dir': { type: 'string', default: 'apps' },
      'install-browsers': { type: 'boolean', default: false },
    },
  })
  if (!values.kit) throw new SandboxError('Pass --kit <kit>')
  await testApp({
    root: SANDBOX_ROOT,
    kit: values.kit,
    directory: values.dir,
    installBrowsers: values['install-browsers'],
    runner: processRunner({ stream: true }),
    waitForUrl,
    log: (line) => console.log(line),
  })
  return true
})
