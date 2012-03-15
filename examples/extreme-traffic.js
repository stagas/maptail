var colors = require('colors')
var maptail = require('../')
var express = require('express')
var app = express.createServer()

app.use(maptail.track())
app.use(maptail.static())

maptail.attach(app)

app.listen(8080, 'localhost')

// generate dummy data

function rand () {
  return Math.floor(Math.random() * 256)
}

var all = []
var paths = [ 'home', 'articles', 'img', 'js', 'css' ]
var subpaths = [ 'foo', 'bar', 'foobar' ]
for (var i = paths.length; i--;)
  for (var n = subpaths.length; n--;)
    for (var x = 3; x--;)
      all.push('/' + paths[i] + '/' + subpaths[n] + '/' + Math.floor(Math.random() * Date.now()).toString(36).substr(0, 4))
var ips = []
for (var i = 40; i--;) {
  ips.push([0,0,0,0].map(rand).join('.'))
}

var n = 0
;(function emitRandomIP () {
  if (Math.random() * 80 < 1) {
    ips.push([0,0,0,0].map(rand).join('.'))
    if (ips.length > 40) ips.shift()
  }
  if (Math.random() * 10 < 4)
    //for (var i = Math.random() * 3; i--;)
      maptail.emit('ip'
      , ips[Math.floor(Math.random() * ips.length)]
      , ips[Math.floor(Math.random() * ips.length)].white + ' '
        + all[Math.floor(Math.random() * all.length)] + ' '
        + 'log line '.yellow
        + 'log line '.green
        + 'log line '.red
        + 'log line '.cyan
        + 'log line '.magenta
        + 'log line '.grey
      )
  setTimeout(emitRandomIP, Math.floor(Math.random() * 50) + 20)
}());

maptail.config.bufferMax = 200
maptail.config.bufferTime = 500
maptail.config.maxDots = 100
