### maptail

Tail GeoIP data on a world map in realtime.

### Install

```bash
npm i -g maptail
```

### Usage

```bash
# pipe logs into maptail
tail -f my-logs | maptail

# open the UI at http://localhost:3000
```

### Options

- `--silent`: suppress stdout output
- `--logs`: show logs on screen (default: true)
- `--port <port>`: port to listen on (default: env PORT or 3000)

### Middleware API

You can embed maptail into an existing Node/Express HTTP server via a reusable middleware. It will intercept all writes to stdout (i.e from your logs) and serve the UI to the specified endpoint.

```ts
import express from 'express'
import morgan from 'morgan'
import { maptail } from 'maptail'

const app = express()
app.use(morgan('combined'))
app.use(maptail('/maptail'))

app.listen(3000, () => {
  console.log('Server listening on http://localhost:3000')
})
```

### Attribution

maptail uses the IP2Location LITE database for <a href="https://lite.ip2location.com">IP geolocation</a>.

### License

MIT
