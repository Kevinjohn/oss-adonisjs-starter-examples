import { test } from '@japa/runner'
import { rmSync } from 'node:fs'
import { processRunner } from '../../src/command_runner.ts'
import { temporaryDirectory } from '../helpers/app_fixture.ts'

test.group('process runner', () => {
  test('reports a failed child command and its captured output', async ({ assert }) => {
    const cwd = temporaryDirectory()
    try {
      const result = await processRunner({ stream: false })
        .run(
          process.execPath,
          [
            '-e',
            "process.stdout.write('started\\n'); process.stderr.write('failed\\n'); process.exitCode = 7",
          ],
          { cwd, env: process.env }
        )
        .then(
          () => ({ error: undefined }),
          (error: unknown) => ({ error })
        )
      assert.isDefined(result.error)
      if (!(result.error instanceof Error)) throw result.error
      assert.include(result.error.message, `Command failed with exit 7: ${process.execPath}`)
      assert.include(result.error.message, `in ${cwd}`)
      assert.include(result.error.message, 'started\n')
      assert.include(result.error.message, 'failed\n')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
