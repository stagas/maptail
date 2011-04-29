#!/usr/bin/env node
/*
 * node maptail.js <file_to_tail> [hostname] [port]
 */

var http = require('http')
  , spawn = require('child_process').spawn

  , express = require('express')
  , io = require('socket.io')
  
  , geoip = require('geoip')
  , cities = geoip.open(__dirname + '/GeoLiteCity.dat')
  
  , port = process.argv.length >= 4 && process.argv[4] || process.env.PORT || process.env.POLLA_PORT || 8080
  , host = process.argv.length >= 3 && process.argv[3] || process.env.HOST || process.env.POLLA_HOST || 'localhost'
  
  , wsport = process.env.WSPORT || + port + 111
  , wshost = process.env.WSHOST || host
  
  , filename = process.argv.length >= 2 && process.argv[2] || 'nohup.out'

// configuration  
var app = express.createServer()

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.logger());
  app.use(express.methodOverride());
  app.use(express.bodyParser());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// main app

var allowedIPs = {}
  , connected = {}
  , users = {}

app.get('/', function(req, res) {
  res.redirect('/map');
})

app.get('/map', function(req, res) {
  res.render('map', { layout: false, locals: { title: 'tail -f ' + filename, wshost: wshost, wsport: wsport } })
})

// get configuration information
app.get('/js/config.js', function(req, res) {
  html = [
    'var WSHOST = "' + wshost + '";'
  + 'var WSPORT = ' + wsport + ';'
  ]
  
  res.send(html.join('\n'))
})

app.get('/admin', function(req, res) {
  req.users.list(function(err, data) {
    res.render('admin', { locals: { title: 'Admin area', data: data } })
  })
})

// start Server
app.listen(port, host);

// socket.io

var wsserver = http.createServer()
wsserver.listen(wsport, wshost);
var socket = io.listen(wsserver)

socket.on('connection', function(client) {
  var id = client.sessionId
    , ip = client && client.request && client.request.socket && client.request.socket.remoteAddress || '000'

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
      console.log('Failed update, ' + from.name + ' lacks coordinates.')
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

var tail = spawn('tail', ['-n', '1000', '-f', filename])

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
      
      ips[ip] = { name: ip, line: htmlspecialchars(line), lastActivity: Date.now() }
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
          console.log('Could not grab location for', ip, ' - ', city)
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

var htmlspecialchars = function (string, quote_style, charset, double_encode) {
  // http://kevin.vanzonneveld.net
  // +   original by: Mirek Slugen
  // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +   bugfixed by: Nathan
  // +   bugfixed by: Arno
  // +    revised by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +    bugfixed by: Brett Zamir (http://brett-zamir.me)
  // +      input by: Ratheous
  // +      input by: Mailfaker (http://www.weedem.fr/)
  // +      reimplemented by: Brett Zamir (http://brett-zamir.me)
  // +      input by: felix
  // +    bugfixed by: Brett Zamir (http://brett-zamir.me)
  // %        note 1: charset argument not supported
  // *     example 1: htmlspecialchars("<a href='test'>Test</a>", 'ENT_QUOTES');
  // *     returns 1: '&lt;a href=&#039;test&#039;&gt;Test&lt;/a&gt;'
  // *     example 2: htmlspecialchars("ab\"c'd", ['ENT_NOQUOTES', 'ENT_QUOTES']);
  // *     returns 2: 'ab"c&#039;d'
  // *     example 3: htmlspecialchars("my "&entity;" is still here", null, null, false);
  // *     returns 3: 'my &quot;&entity;&quot; is still here'

  var optTemp = 0, i = 0, noquotes= false;
  if (typeof quote_style === 'undefined' || quote_style === null) {
      quote_style = 2;
  }
  string = string.toString();
  if (double_encode !== false) { // Put this first to avoid double-encoding
      string = string.replace(/&/g, '&amp;');
  }
  string = string.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  var OPTS = {
      'ENT_NOQUOTES': 0,
      'ENT_HTML_QUOTE_SINGLE' : 1,
      'ENT_HTML_QUOTE_DOUBLE' : 2,
      'ENT_COMPAT': 2,
      'ENT_QUOTES': 3,
      'ENT_IGNORE' : 4
  };
  if (quote_style === 0) {
      noquotes = true;
  }
  if (typeof quote_style !== 'number') { // Allow for a single string or an array of string flags
      quote_style = [].concat(quote_style);
      for (i=0; i < quote_style.length; i++) {
          // Resolve string input to bitwise e.g. 'PATHINFO_EXTENSION' becomes 4
          if (OPTS[quote_style[i]] === 0) {
              noquotes = true;
          }
          else if (OPTS[quote_style[i]]) {
              optTemp = optTemp | OPTS[quote_style[i]];
          }
      }
      quote_style = optTemp;
  }
  if (quote_style & OPTS.ENT_HTML_QUOTE_SINGLE) {
      string = string.replace(/'/g, '&#039;');
  }
  if (!noquotes) {
      string = string.replace(/"/g, '&quot;');
  }

  return string;
}