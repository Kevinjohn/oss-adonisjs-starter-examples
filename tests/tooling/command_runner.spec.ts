import { test } from '@japa/runner'
import { setTimeout as delay } from 'node:timers/promises'
import { rmSync } from 'node:fs'
import { processRunner } from '../../src/command_runner.ts'
import { temporaryDirectory } from '../helpers/app_fixture.ts'

test.group('process runner', () => {
  test('reports exit without waiting for a worker that inherited the output pipes', async ({
    assert,
  }) => {
    const cwd = temporaryDirectory()
    const background = processRunner({ stream: false }).start(
      process.execPath,
      [
        '-e',
        [
          "const { spawn } = require('node:child_process')",
          "const worker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 2000)'], { stdio: 'inherit' })",
          "worker.once('spawn', () => process.exit(7))",
        ].join('\n'),
      ],
      { cwd, env: process.env }
    )
    try {
      const outcome = await Promise.race([
        background.exited,
        delay(1000, new Error('Worker still holds output pipes')),
      ])
      assert.include(outcome.message, 'Background command exited (7)')
    } finally {
      try {
        await background.stop()
      } finally {
        rmSync(cwd, { recursive: true, force: true })
      }
    }
  })

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
