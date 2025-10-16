import { cac } from 'cac'
import http from 'http'
import { maptail } from './maptail.js'

const cli = cac('maptail')

cli
  .option('--silent', 'Suppress stdout output')
  .option('--logs', 'Show logs on screen', { default: true })
  .option('--port <port>', 'Port to listen on', { default: 3000 })
  .help()

const { options } = cli.parse()

if (options.help) {
  process.exit(0)
}

// Create server using the middleware
const server = http.createServer(maptail('/', options))

const PORT = Number(options.port || process.env.PORT || 3000)
server.listen(PORT, () => {
  console.log(`[maptail] Server listening on http://localhost:${PORT}`)
})

process.stdin.pipe(process.stdout)
