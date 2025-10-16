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


