var EventEmitter = require('events').EventEmitter
var geoip = require('geoip-lite-with-city-data')

var maptail = exports = module.exports = new EventEmitter

maptail.config = {
  // maximum history items
  historyMax: 50

  // maximum markers to buffer
, bufferMax: 50

  // buffer time in milliseconds
, bufferTime: 1000

  // markers' initial time to live in seconds
, ttl: 100 // seconds

  // maximum dots to be displayed (this adjusts ttl automatically)
, maxDots: 200

  // report visitors up to that age
, maxAge: 240 // seconds

  // only emit ips with geo data
, onlyLookups: false

  // aging repaint in fps
, fps: 120
}

maptail.history = []
maptail.buffer = []

maptail.on('ip', function (ip, message) {
  var geo = ip && maptail.lookup(ip) || {}
  delete geo.range
  delete geo.region
  geo.ip = ip  
  geo.date = Date.now()
  if (message) geo.message = message
  if (!maptail.config.onlyLookups || geo.ll) maptail.emit('geoip', geo)
})

maptail.lookup = function (ip) {
  return geoip.lookup(ip)
}

maptail.track = function () {
  return function (req, res, next) {
    // get real ip address
    var ip =
    req.headers['ip']
    || req.headers['x-forwarded-for']
    || req.headers['x-real-ip']
    || req.headers['x-ip']
    || req.connection.remoteAddress
    maptail.emit('ip', ip)
    next()
  }
}

maptail.static = function (opts) {
  var express = require('express')
  return express.static(__dirname + '/../public')
}

maptail.attach = function (app) {
  var users = {
    list: []
  , has: function (socket) {
      return !!~this.list.indexOf(socket)
    }
  , add: function (socket) {
      if (!this.has(socket)) this.list.push(socket)
    }
  , remove: function (socket) {
      var index = this.list.indexOf(socket)
      if (index > -1) this.list.splice(index, 1)
    }
  , forEach: function (fn) {
      this.list.forEach(fn)
    }
  }
  var simpl = require('simpl')
  var ws = simpl.createServer(app)
  ws.use(simpl.events())
  ws.use(simpl.json())
  ws.on('connection', function (socket) {
    socket.on('close', function () {
      users.remove(socket)
    })
    socket.remote
    .on('subscribe', function (what) {
      if (what === 'geoip') {
        users.add(socket)
        maptail.config.dateNow = Date.now()
        socket.remote.emit('config', maptail.config)
        socket.remote.emit('geoip', maptail.history)
      }
    })
    .on('unsubscribe', function (what) {
      if (what === 'geoip') users.remove(socket)
    })
  })
  var before = Date.now()
  maptail.on('geoip', function (geo) {
    maptail.history.push(geo)
    maptail.buffer.push(geo)
    if (maptail.history.length > maptail.config.historyMax) maptail.history.shift()
    if (Date.now() - before > maptail.config.bufferTime && maptail.buffer.length) {
      users.forEach(function (socket) {
        socket.remote.emit('geoip', maptail.buffer)
      })
      maptail.buffer = []
      before = Date.now()
    }
    else {
      if (maptail.buffer.length > maptail.config.bufferMax) maptail.buffer.shift()
    }
  })
}
