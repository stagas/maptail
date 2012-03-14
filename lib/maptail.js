var EventEmitter = require('events').EventEmitter
var geoip = require('geoip-lite-with-city-data')

var maptail = exports = module.exports = new EventEmitter

maptail.history = []
maptail.historyMax = 100
maptail.buffer = []
maptail.bufferMax = 50
maptail.bufferTime = 100

maptail.clientConfig = {}

maptail.on('ip', function (ip, message) {
  var geo = ip && maptail.lookup(ip) || {}
  delete geo.range
  delete geo.region
  geo.ip = ip  
  geo.date = Date.now()
  if (message) geo.message = message
  maptail.emit('geoip', geo)
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
        socket.remote.emit('config', maptail.clientConfig)
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
    if (maptail.history.length > maptail.historyMax) maptail.history.shift()
    if (Date.now() - before > maptail.bufferTime && maptail.buffer.length) {
      users.forEach(function (socket) {
        socket.remote.emit('geoip', maptail.buffer)
      })
      maptail.buffer = []
      before = Date.now()
    }
    else {
      if (maptail.buffer.length > maptail.bufferMax) maptail.buffer.shift()
    }
  })
}
