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
for (var i = 10; i--;) {
  ips.push([0,0,0,0].map(rand).join('.'))
}

var n = 0
;(function emitRandomIP () {
  if (Math.random() * 10 < 7) {
    ips.push([0,0,0,0].map(rand).join('.'))
    if (ips.length > 500) ips.shift()    
    var ip = ips[Math.floor(Math.random() * (ips.length * 0.7))]
    for (var i = Math.floor(Math.random() * 10) + 1; i--;) {
      setTimeout(function () {
        maptail.emit('ip'
        , ip
        , ip.white + ' '
          + all[Math.floor(Math.random() * all.length)] + ' '
          + 'log line '.yellow
          + 'log line '.red
        )
      }, Math.floor(Math.random() * 500))
    }
  }
  setTimeout(emitRandomIP, Math.floor(Math.random() * 300) + 20)
}());

maptail.config.onlyLookups = true
maptail.config.bufferTime = 3000
