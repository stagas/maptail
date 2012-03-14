# maptail

<img src="http://dl.dropbox.com/u/396087/maptail.png" border="0" />

maptail is a realtime map view of GeoIP data. Attach it to your server to track visitors, tail a log, pipe to its stdin or use it as a library to build your own implementation. Just emit IP addresses to it from any source and you'll automagically get a cool map with yellow dots and stuff like that streamed in with websockets or whatever transport you'd like to use.

## Installing

`npm install maptail -g`

Omit the `-g` to install as a module.

## How to use

### The command line tool:

`$ maptail -f nohup.out`

`$ tail -f nohup.out | maptail -h my.host.com -p 3000`

### In your server:

```javascript
var maptail = require('maptail')
var express = require('express')
var app = express.createServer()

app.use(maptail.track())
app.use('/map', maptail.static())

maptail.attach(app)

app.listen(8080, 'localhost')
```

Let me explain what these are doing here a bit. `maptail.track()` tracks visitors' IPs and emits them to maptail. `maptail.static()` is an `express.static()` middleware that points to our static data (maptail.html, css, etc.)

`maptail.attach(app)` attaches a [simpl](https://github.com/stagas/simpl) WebSocket server which makes it possible for our frontend app to easily subscribe to the GeoIP data events sent by maptail and display them on the map.

If for example you don't want to track visitors of the http server but instead you want to send IPs from another source, you can easily remove `maptail.track()` from the middleware and use `maptail.emit('ip', ipAddress[, logMessage])` to feed our map. It will take care the rest for you.

## Credits

This is based on [mape](https://github.com/mape)'s [wargames](https://github.com/mape/node-wargames).

[geoip-lite](https://github.com/bluesmoon/node-geoip) by [Philip Tellis](https://github.com/bluesmoon).

Earlier versions used [kuno](https://github.com/kuno)'s [GeoIP](https://github.com/kuno/GeoIP) module but since it now uses a C library, I couldn't use it.

[MaxMind](http://www.maxmind.com/) for their free to use GeoIP data.

## Licence

maptail is MIT/X11. The rest of the components are of their respective licences.
