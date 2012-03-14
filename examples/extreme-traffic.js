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
  if (Math.random() * 10 < 10) maptail.emit('ip', [0,0,0,0].map(rand).join('.'))
}, 1)
