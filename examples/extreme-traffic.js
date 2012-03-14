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

setInterval(function () {
  for (var i = 10; i--;) maptail.emit('ip', [0,0,0,0].map(rand).join('.'))
}, 100)

maptail.config.bufferMax = 200
maptail.config.bufferTime = 500
maptail.config.maxDots = 200
