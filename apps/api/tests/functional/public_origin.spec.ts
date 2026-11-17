import { spawnSync } from 'node:child_process'
import { test } from '@japa/runner'

test.group('public origin configuration', () => {
  test('accepts a public HTTPS origin for production links', ({ assert }) => {
    const result = spawnSync(
      process.execPath,
      [
        '--import=@poppinss/ts-exec',
        '--input-type=module',
        '-e',
        "const { publicOrigin } = await import('#start/public_origin'); console.log(publicOrigin)",
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'production', APP_URL: 'https://example.com' },
      }
    )
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), 'https://example.com')
  })

  test('refuses an insecure public URL at application boot', ({ assert }) => {
    const result = spawnSync(process.execPath, ['ace', 'list:routes'], {
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production', APP_URL: 'http://app.example.com' },
    })
    assert.equal(result.status, 1)
    assert.include(
      result.stdout + result.stderr,
      'APP_URL: public production origins require HTTPS'
    )
  })
})
