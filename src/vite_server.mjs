import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [port, readinessPath] = process.argv.slice(2)
const requireFromApp = createRequire(join(process.cwd(), 'package.json'))
const { createServer } = await import(pathToFileURL(requireFromApp.resolve('vite')).href)

const server = await createServer({
  server: { host: '127.0.0.1', port: Number(port), strictPort: true },
  plugins: [
    {
      name: 'starter-runner-readiness',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url !== readinessPath) return next()
          response.setHeader('x-starter-runner-readiness', readinessPath)
          response.end()
        })
      },
    },
  ],
})

try {
  await server.listen()
} catch (error) {
  await server.close()
  throw error
}
