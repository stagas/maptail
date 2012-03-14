// config
var config = { timeDiff: 0 }

// visitors
var visitors = 0
function visitorsInc () { visitors++ }
function visitorsDec () { visitors-- }

// app

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
        this.list[marker.ip] = marker
        if (!this.freeze) {
          this.append(marker)
        } else {
          this.freeze.push(marker)
        }
      }
    , append: function (marker) {
        var self = this
        this.active++
        if (this.active > config.maxDots) {
          config.originalttl = config.originalttl || config.ttl
          config.ttl -= 1
          config.ttl = Math.max(config.ttl, 1)
        }      
        this.object.appendChild(marker.object)
        this.ipList.appendChild(marker.ipList.object)
        this.ipList.insertBefore(
          marker.ipList.object, this.ipList.firstChild
        )
        marker.ipList.object.onmouseover = marker.object.onmouseover = function () {
          clearTimeout(self.freezeTimeout)
          self.freeze = self.freeze || []
          self.freezeRemove = self.freezeRemove || []
          marker.object.classList.add('hovered')
          messages.object.onmouseover()
        }
        marker.ipList.object.onmouseout = marker.object.onmouseout = function () {
          self.freezeTimeout = setTimeout(function () {
            self.freeze.forEach(self.append.bind(self))
            self.freezeRemove.forEach(self.destroy.bind(self))
            self.freeze = false
            self.freezeRemove = false
          }, 170)
          marker.object.classList.remove('hovered')
          messages.object.onmouseout()
        }
      }
    , remove: function (marker) {
        if (this.freeze) {
          this.freezeRemove.push(marker)
        } else {
          this.destroy(marker)
        }
      }
    , destroy: function (marker) {
        if (marker.ip in this.list) {
          this.active--
          if (this.active < config.maxDots) {
            config.originalttl = config.originalttl || config.ttl
            config.ttl += 1
            config.ttl = Math.min(config.originalttl * 2, config.ttl)
          }
          try {
            delete this.list[marker.ip]
            this.object.removeChild(marker.object)
            this.ipList.removeChild(marker.ipList.object)
          } catch (e) {}
        }
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
      var marker
      geo.date += config.timeDiff
      if (!(geo.ip in this.markers.list)) {
        visitorsInc()
        marker = new Marker(geo)
        marker.paint()
        this.markers.add(marker)
      } else {
        marker = this.markers.list[geo.ip]
        clearTimeout(marker.visitorTimeout)
        marker.visitorTimeout = setTimeout(visitorsDec, config.maxAge * 1000)
        marker.date = geo.date
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
      this.ipList.object.innerHTML = (geo.city ? '<span class="city">' + geo.city + '</span> ' : '') + this.ip + ' <span class="country">' + (geo.country || '??') + '</span>'

      this.visitorTimeout = setTimeout(visitorsDec, config.maxAge * 1000)
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

  setInterval(function () {
    map.markers.age()
  }, 1000 / config.fps)

  connect(function (client) {  
    client.remote.on('config', function (cfg) {
      if (cfg.dateNow) cfg.timeDiff = Date.now() - cfg.dateNow
      for (var k in cfg) { config[k] = cfg[k] }
    })

    client.remote.on('geoip', function (geos) {
      var nadd = config.bufferTime / geos.length, n = 0
      geos.forEach(function (geo) {
        setTimeout(function () {
          if (geo.ll) map.placeMarker(geo)
          active.textContent = visitors
          if (geo.message) messages.add(geo.message)
        }, n += nadd)
      })
    })

    client.remote.emit('subscribe', 'geoip')
  })
}
