// config
var config = {}

// markers' time to live in seconds
config.ttl = 60 * 5 // 5 minutes

// aging repaint in milliseconds
config.ageInterval = 100

// app
function createMap () {
  var map = {}
  map.object = document.getElementById('map')
  map.size = {
    width: 0
  , height: 0
  , original: { width: 554, height: 359 }
  }
  map.offset = { x: 0, y: 0 }
  map.margin = 10
  map.markers = {
    object: document.getElementById('markers')
  , list: {}
  , ipList: document.getElementById('iplist')
  , freeze: false
  , active: 0
  , add: function (marker) {
      this.active++
      this.list[marker.ip] = marker
      if (!this.freeze) {
        this.append(marker)
      } else {
        this.freeze.push(marker)
      }
    }
  , append: function (marker) {
      var self = this
      this.object.appendChild(marker.object)
      this.ipList.appendChild(marker.ipList.object)
      this.ipList.insertBefore(
        marker.ipList.object, this.ipList.firstChild
      )
      marker.ipList.object.onmouseover = function () {
        clearTimeout(self.freezeTimeout)
        self.freeze = self.freeze || []
        marker.object.classList.add('hovered')
      }
      marker.ipList.object.onmouseout = function () {
        self.freezeTimeout = setTimeout(function () {
          self.freeze.forEach(self.append.bind(self))
          self.freeze = false
        }, 500)
        marker.object.classList.remove('hovered')
      }
    }
  , remove: function (marker) {
      this.active--
      delete this.list[marker.ip]
      this.object.removeChild(marker.object)
      this.ipList.removeChild(marker.ipList.object)
    }
  , forEach: function (fn) {
      var self = this
      Object.keys(this.list).forEach(function (key) {
        fn(self.list[key])
      })
    }
  , paint: function () {
      this.forEach(function (marker) {
        marker.paint()
      })
    }
  , age: function () {
      this.forEach(function (marker) {
        marker.age()
      })
    }
  }
  map.placeMarker = function (geo) {
    if (!(geo.ip in this.markers.list)) {
      var marker = new Marker(geo)
      marker.paint()
      this.markers.add(marker)
    } else {
      this.markers.list[geo.ip].date = geo.date
    }
  }
  map.object.style.position = 'absolute'
  map.object.style.margin = map.margin + 'px'

  map.paper = Raphael(map.object)
  map.paper
    .path(mapVector)
    .attr({
      stroke: "#333"
    , 'stroke-width': 1.05
    })

  function Marker (geo) {
    this.ip = geo.ip
    this.latlon = geo.ll
    this.date = geo.date
    
    this.object = document.createElement('div')
    this.object.className = 'marker'
    this.location = {
      object: document.createElement('div')
    }
    var html =
    '<div class="data">'
    + '<div class="ip">' + geo.ip + '</div>'
    + '<div class="location">'
    + (geo.city ? geo.city + ', ' : '') + (geo.country ? geo.country : 'unknown')
    + '</div>'
    + '<div class="age">active <span class="age-number">23.1</span>s ago</div>'
    + '</div>'
    this.object.innerHTML = html
    this.inner = {}
    this.inner.ageNumber = this.object.getElementsByClassName('age-number')[0]
    this.inner.ageNumber.textContent = '0.0'

    this.ipList = {
      object: document.createElement('div')
    }
    this.ipList.object.className = 'ip'
    this.ipList.object.innerHTML = this.ip + ' <span style="color:yellow">' + (geo.country || '??') + '</span>'
  }

  Marker.prototype.paint = function () {
    var coords = latLongToPx(this.latlon)
    this.object.style.left = coords.x + 'px'
    this.object.style.top = coords.y + 'px'
  }

  Marker.prototype.age = function () {
    var now = Date.now()
    var age = (now - this.date) / 1000
    this.inner.ageNumber.textContent = age.toFixed(1)
    if (age > config.ttl) map.markers.remove(this)
    else
      this.object.style.opacity = 1 - (age / config.ttl)
  }

  function latLongToPx(latlon) {
    var lat = latlon[0]
    var lon = latlon[1]
    var x, y
    var w = map.size.width
    var h = map.size.height
    var ox = -(w * 0.0245)
    var oy = (h * 0.218)

    x = (w * (180 + lon) / 360) % w

    lat = lat * Math.PI / 180
    y = Math.log(Math.tan((lat / 2) + (Math.PI / 4)))
    y = (h / 2) - (w * y / (2 * Math.PI))

    return {
      x: x - map.margin + ox
    , y: y - map.margin + oy
    }
  }

  function onresize () {
    map.viewport = {
      width: window.innerWidth - (map.margin * 2)
    , height: window.innerHeight - (map.margin * 2)
    }
    map.paper.setSize(map.viewport.width, map.viewport.height)
    map.paper.canvas.style.height = map.viewport.height
    map.paper.setViewBox(0, 0, map.size.original.width, map.size.original.height)
    var ratio = map.size.original.width / map.size.original.height
    var newRatio = map.viewport.width / map.viewport.height
    if (ratio > newRatio) {
      map.size.width = map.viewport.width
      map.size.height = map.viewport.width / ratio
      map.offset.x = 0
      map.offset.y = (map.viewport.height - map.size.height) / 2
    } else {
      map.size.height = map.viewport.height
      map.size.width = map.viewport.height * ratio
      map.offset.y = 0
      map.offset.x = (map.viewport.width - map.size.width) / 2
    }
    map.object.style.left = map.offset.x + 'px'
    map.object.style.top = map.offset.y + 'px'
    map.markers.paint()
  }

  onresize()
  var resizeTimeout
  window.onresize = function () {
    clearTimeout(resizeTimeout)
    resizeTimeout = setTimeout(function () {
      onresize()
    }, 200)
  }

  return map
}

function connect (callback) {
  var simpl = require('simpl')
  var client = simpl.createClient()
  client.use(simpl.events())
  client.use(simpl.json())
  client.on('connect', callback)
}

function safe (text) {
  return text
    .split('&').join('&amp;')
    .split('"').join('&quot;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
}

function ansiToHtml (text) {
  var colors = {
    30: "#777"
  , 31: "red"
  , 32: "#0f0"
  , 33: "yellow"
  , 34: "blue"
  , 35: "magenta"
  , 36: "cyan"
  , 37: "#eee"
  , 38: "#777"
  , 39: "#777"
  }
  return text.replace(/\033\[(?:(\d+);)?(\d+)m/g, function (m, extra, color) {
    var style = 'color:' + (colors[color] || '#777')
    if (extra == 1) {
      style += ';font-weight=bold'
    } else if (extra == 4) {
      style += ';text-decoration=underline'
    }
    return '</span><span style="' + style + '">'
  })
}

window.onload = function () {
  var map = createMap()
  var active = document.getElementById('active-number')

  /*
  // calibration markers
  // they should land on islands
  //

  map.placeMarker({ ip: '123.123.123.1', date: Date.now(), ll: [ 35.325, 25.1306 ] })
  map.placeMarker({ ip: '123.123.123.2', date: Date.now(), ll: [ 53.533778,-132.39624 ]})
  map.placeMarker({ ip: '123.123.123.3', date: Date.now(), ll: [ -42.065607,146.689453 ]})
  map.placeMarker({ ip: '123.123.123.4', date: Date.now(), ll: [ 23.563987,120.585938 ]})
  map.placeMarker({ ip: '123.123.123.5', date: Date.now(), ll: [ -51.835778,-59.765625 ]})
  map.placeMarker({ ip: '123.123.123.6', date: Date.now(), ll: [ 57.326521,-153.984375 ]})
  */

  var messages = {
    object: document.getElementById('messages')
  , lines: []
  , freeze: 0
  , add: function (message) {
      var line = document.createElement('div')
      line.innerHTML = ansiToHtml(safe(message))
      this.lines.push(line)
      if (!this.freeze) {
        this.append(line)
      }
    }
  , append: function (line) {
      this.object.appendChild(line)
      if (this.lines.length > 10) {
        this.object.removeChild(this.lines.shift())
      }
      this.lines.forEach(function (line, index) {
        line.style.opacity = (0.6 / 10) * index
      })
    }
  }
  messages.object.onmouseover = function (e) {
    clearTimeout(messages.mouseoutTimeout)
    if (!messages.freeze) {
      messages.freeze = messages.lines.length - 1
      messages.lastLine = messages.lines[messages.freeze]
    }
  }
  messages.object.onmouseout = function (e) {
    if (messages.freeze) {
      messages.mouseoutTimeout = setTimeout(function () {
        messages.lines
          .slice(messages.freeze)
          .forEach(messages.append.bind(messages))
        messages.freeze = 0
      }, 1000)
    }
  }

  setInterval(function () {
    map.markers.age()
  }, config.ageInterval)

  connect(function (client) {
    client.remote.emit('subscribe', 'geoip')
    
    client.remote.on('config', function (cfg) {
      for (var k in cfg) { config[k] = cfg[k] }
    })

    client.remote.on('geoip', function (geos) {
      geos.forEach(function (geo) {
        if (geo.ll) map.placeMarker(geo)
        active.textContent = map.markers.active
        if (geo.message) messages.add(geo.message)
      })
    })
  })
}
