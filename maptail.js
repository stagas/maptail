#!/usr/bin/env node
/*
 * node maptail.js <file_to_tail> [hostname] [port]
 */

var http = require('http')
  , spawn = require('child_process').spawn

  , express = require('express')

  , login = require('helpful/login')
  , allow = require('helpful/allow')
  , boil = require('helpful/boil')
  , helpful = require('helpful')

  , io = require('socket.io')
  
  , geoip = require('geoip')
  , cities = geoip.open(__dirname + '/GeoLiteCity.dat')
  
  , log = helpful.log(1)
  , start = helpful.start
  , rewrite = helpful.rewrite
  , cache = helpful.cache
  , compile = helpful.compile
  , render = helpful.render
  , expires = helpful.expires

  , port = process.argv.length >= 4 && process.argv[4] || process.env.PORT || process.env.POLLA_PORT || 8080
  , host = process.argv.length >= 3 && process.argv[3] || process.env.HOST || process.env.POLLA_HOST || 'localhost'
  
  , wsport = process.env.WSPORT || + port + 111
  , wshost = process.env.WSHOST || host
  
  , filename = process.argv.length >= 2 && process.argv[2] || 'nohup.out'
  
var app = express.createServer()

app.configure(function(){
  app.use(express.methodOverride());
  app.use(express.bodyDecoder());
  app.use(app.router);
  app.use(express.staticProvider(__dirname + '/public'));
  app.set('views', __dirname + '/views');
});
/*
var config = boil(app, {
  host: host
, 'public': __dirname + '/public'
, views: __dirname + '/views'

, context: {
    wshost: wshost
  , wsport: wsport
  , htmlspecialchars: helpful.htmlspecialchars
  }
  
, rewrite: function(app) {
    app.get('*.html|*.htm', rewrite(helpful.stripExt))
    app.get('/index', rewrite('/'))
  }
  
, custom: [
    cache()
  , login({
      css: '/css/wargames.css'
    , after: function(req, res, next) {
        req.expireAll()
        next()
      }
    })
  ]
})
*/

compile(config.views)

// main app

var allowedIPs = {}
  , connected = {}
  , users = {}

app.get('/', expires(false), function(req, res) {
  res.render('index', { title: 'Home' })
})

// remove the allow() middleware to allow everyone in
app.get('/map', allow('admin', 'moderator'), expires(false), function(req, res) {
  allowedIPs[req.headers.ip] = req.session.user
  res.render('map', { layout: 'empty', title: 'tail -f ' + filename })
})

app.get('/js/config.js', allow('admin', 'moderator'), expires(false), function(req, res) {
  html = [
    'var WSHOST = "' + wshost + '";'
  + 'var WSPORT = ' + wsport + ';'
  ]
  
  res.send(html.join('\n'))
})

app.get('/admin', expires(false), function(req, res) {
  req.users.list(function(err, data) {
    res.render('admin', { title: 'Admin area', data: data })
  })
})

start(app, port, host)

// socket.io

var wsserver = http.createServer()
start(wsserver, wsport, wshost)
var socket = io.listen(wsserver)

socket.on('connection', function(client) {
  var id = client.sessionId
    , ip = client && client.request && client.request.socket && client.request.socket.remoteAddress || '000'

  if (typeof allowedIPs[ip] === 'undefined') return

  connected[id] = client

  world.sendStartupData(client)  

  client.on('disconnect', function() {
    delete connected[id]
  })
})

var world = {
  users: {}
, messages: []
, messageCount: 0
, getPublicUserInfo: function(user) {
    return {
      'name': user.name
    , 'city': user.city
    , 'lng': user.lng
    , 'lat': user.lat
    , 'lastActivity': user.lastActivity
    }
  }
  
, sendUpdate: function(from, silent) {
    var self = this

    self.messages.push({
	    'user': from.name
    , 'city': from.city
	  , 'message': from.line
		})

		if (self.messages.length > 10) {
			self.messages.shift()
		}

    if (from && from.lat) {
      var returnObj = {
        'action': 'newMessage'
      , 'from': self.getPublicUserInfo(from)
      , 'messageCount': self.messageCount
      }

      if (!silent) {
        if (self.messages.length) {
          returnObj.messages = [self.messages[self.messages.length - 1]]
        }
        else {
          returnObj.messages = []
        }
      }

      broadcast(returnObj)
    }
    else {
      log('Failed update, ' + from.name + ' lacks coordinates.')
    }
  }
  
, sendStartupData: function (client) {
    var self = this

    var activityLimit = new Date().getTime() - 2400000
    var userList = {}

    Object.keys(self.users).forEach(function (name) {
      var user = self.users[name]
      if (user.lat && user.lastActivity > activityLimit) {
        userList[name] = self.getPublicUserInfo(user)
      } else {
        delete self.users[name]
      }
    })

    client.send(JSON.stringify({
      'action': 'getUsers'
    , 'users': userList
    , 'removeTimeout': 2400000
    , 'channel': filename
    , 'messages': self.messages
    , 'messageCount': self.messageCount
    , 'serverTime': new Date().getTime()
    }))
  }
}

// tail -n 1000 -f filename

tail = spawn('tail', ['-n', '1000', '-f', filename])

tail.stdout.on('data', function (data) {
  var dataStr = data.toString()
  
  dataStr.replace(/([^\n]+)\n/g, function(m, line) {
    // proxy tail
    console.log(line)
  
    var ipsArray = line.match(/(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/gm) || []
      , ips = {}
      , ipsplit = []
    
    ipsArray.forEach(function(ip) {
      // no version numbers
      ipsplit = ip.split('.')
      for (var i = 0, c = 0; i < ipsplit.length; i++) {
        if (ipsplit[i] < 10) c++
        if (c === 3) return
      }
      
      ips[ip] = { name: ip, line: helpful.htmlspecialchars(line), lastActivity: Date.now() }
    })

    for (var ip in ips) {
      // Return an object of city information
      // {
      //  "country_code":"US",
      //  "country_code3":"USA",
      //  "country_name":"United States",
      //  "continet_code":"NA",
      //  "region":"CA",
      //  "city":"Mountain View",
      //  "postal_code":"94043",
      //  "latitude":37.41919999999999,
      //  "longitude":-122.0574,
      //  "dma_code":807,
      //  "metro_code":807,
      //  "area_code":650
      //  }
      if (typeof ips[ip].city === 'undefined') {
        city = geoip.City.record_by_addr(cities, ip)
        if (city) {
          ips[ip].city = city
          ips[ip].lat = city.latitude
          ips[ip].lng = city.longitude
          
          world.messageCount++
          world.users[ip] = ips[ip]
          
          world.sendUpdate(ips[ip])
        } else {
          ips[ip].city = {}
          ips[ip].lat = 0
          ips[ip].lng = 0
          log('Could not grab location for', ip, ' - ', city)
        }
      }
    }
  })
})

tail.stderr.on('data', function (data) {
  console.log('tail stderr: ' + data)
})

tail.on('exit', function (code) {
  if (code !== 0) {
    console.log('tail process exited with code ' + code);
  }
})

// functions

var broadcast = function(msg) {
  var json = JSON.stringify(msg)

  for (var id in connected) {
    connected[id].send(json)
  }
}
