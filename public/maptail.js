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
  var dots = {
    object: document.getElementById('dots')
  , add: function (source, target) {
      if (this.list.length < this.max) {
        var dot = new Dot(source, target)
        this.object.appendChild(dot.object)
        this.list.push(dot)
      }
    }
  , max: 300
  , list: []
  , tick: function () {
      var self = this
      var list = this.list
      var toRemove = []
      list.forEach(function (dot) {
        dot.tick()
        dot.draw()
        if (Math.abs(dot.target.x - dot.x) < 3
          && Math.abs(dot.target.y - dot.y) < 3) {
          self.object.removeChild(dot.object)
          toRemove.push(dot)
        }
      })
      toRemove.forEach(function (dot) {
        list.splice(list.indexOf(dot), 1)
      })
    }
  , clear: function () {
      var self = this
      this.list.forEach(function (dot) {
        self.object.removeChild(dot.object)
      })
      this.list = []
    }
  }

  function Dot (source, target) {
    this.object = document.createElement('div')
    this.object.className = 'dot'
    this.target = target
    this.target.x += 3
    this.target.y += 3
    this.x = source.x
    this.y = source.y
    this.vx = -15 + Math.random() * 5
    this.vy = (Math.random() * 6) - 3
  }

  Dot.prototype.tick = function () {
    var dist = { x: this.target.x - this.x, y: this.target.y - this.y }
    this.vx += (this.vx * (0.58 + (Math.random() * 0.04))) + (dist.x * 0.00070) * Math.max(1, Math.min(9 - (Math.abs(dist.x) * 0.0011), 9) )
    this.vy += (this.vy * (0.58 + (Math.random() * 0.04))) + (dist.y * 0.00070) * Math.max(1, Math.min(9 - (Math.abs(dist.y) * 0.0011), 9) )

    var l = 6, vx = this.vx, vy = this.vy
    if (this.vx > 0 && this.vx > l) this.vx *= 0.82 , this.vy *= Math.random () * 0.05
    if (this.vx < 0 && this.vx < -l) this.vx *= 0.82 , this.vy *= Math.random () * 0.05
    if (this.vy > 0 && this.vy > l) this.vy *= 0.82 , this.vx *= Math.random () * 0.05
    if (this.vy < 0 && this.vy < -l) this.vy *= 0.82 , this.vx *= Math.random () * 0.05

    this.x += vx
    this.y += vy

    this.vx *= 0.545
    this.vy *= 0.545
  }

  Dot.prototype.draw = function () {
    this.object.style.left = Math.floor(this.x) + 'px'
    this.object.style.top = Math.floor(this.y) + 'px'
  }

  var map = createMap()
  var active = document.getElementById('active-number')
  var regexpInput = document.getElementById('regexp')

  var matches = {
    object: document.getElementById('matches')
  , list: {}
  , length: 0
  , regexp: false
  , maxAge: 10
  , recalcMaxAge: function () {
      if (this.length > 7) this.maxAge -= 30
      if (this.length < 4) this.maxAge += 40
      this.maxAge = Math.max(this.maxAge, 5)
    }
  , createFlyingDot: function (geo) {
      var marker = map.markers.list[geo.ip]
      if (!marker) return
      var source = {
        x: marker.ipList.object.parentNode.offsetLeft + marker.ipList.object.offsetLeft + 100
      , y: marker.ipList.object.parentNode.offsetTop + marker.ipList.object.offsetTop + 6
      }
      var target = map.latLongToPx(marker.latlon)
      target.x += map.offset.x + map.margin
      target.y += map.offset.y + map.margin
      dots.add(source, target)
      marker.ipList.object.classList.add('hovered')
      setTimeout(function () {
        marker.ipList.object.classList.remove('hovered')
      }, 700)
    }
  , destroySoon: function (key, item) {
      var self = this
      clearTimeout(item.removeTimeout)        
      item.removeTimeout = setTimeout(function () {
        self.object.removeChild(item.object)
        delete self.list[key]
        self.length--
        self.recalcMaxAge()
      }, Math.pow(self.maxAge, item.hits))
    }
  , consider: function (geo) {
      var self = this
      var list = this.list

      if (!this.regexp) return this.createFlyingDot(geo)

      var found = false, item
      if (geo.message && (
          (geo.message.match(this.regexp))
          || (geo.country && geo.country.match(this.regexp))
          || (geo.city && geo.city.match(this.regexp))
          )
        ) {
        this.createFlyingDot(geo)        
        for (var k in this.list) {
          if (levenshtein(geo.message, k) <= 12) {
            found = true
            item = this.list[k]
            item.inc()
            item.set(geo)
            this.destroySoon(k, item)
            break
          }
        }
        if (!found) {
          var item = this.list[geo.message] = new HashItem(geo)
          this.object.appendChild(item.object)
          this.length++
          this.recalcMaxAge()
          this.destroySoon(geo.message, item)
        }
      }
    }
  , clear: function () {
      this.object.innerHTML = ''
      this.list = {}
      this.regexp = false
    }
  }

  function HashItem (geo) {
    this.object = document.createElement('div')
    this.hits = 1
    this.set(geo)
  }
  HashItem.prototype.inc = function () {
    this.hits++
  }
  HashItem.prototype.set = function (geo) {
    this.object.innerHTML = ansiToHtml(safe(geo.message))
    this.country = geo.country
    this.city = geo.city
  }

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
      var line = new LineItem(message)
      this.lines.push(line)
      if (!this.freeze) {
        this.append(line)
      }
    }
  , append: function (line) {
      this.object.appendChild(line.object)
      if (this.lines.length > 12) {
        this.object.removeChild(this.lines.shift().object)
      }
      this.lines.forEach(function (line, index) {
        line.object.style.opacity = (1.0 / 12) * index
      })
    }
  }

  function LineItem (message) {
    this.message = message
    this.object = document.createElement('div')
    this.object.innerHTML = ansiToHtml(safe(message))
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
      var coords = map.latLongToPx(this.latlon)
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

    map.latLongToPx = function (latlon) {
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
      dots.clear()
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

  regexpInput.onkeyup = function (e) {
    var val = this.value.toString().trim()
    if (e.which == 13) {
      matches.clear()
      if (val.length) {
        matches.regexp = new RegExp(val, 'igm')
        messages.lines.forEach(function (line) {
          matches.consider(line.message)
        })
      }
    }
  }

  matches.regexp = regexpInput.value && new(RegExp(regexpInput.value, 'igm')) || false

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
          if (geo.message) {
            messages.add(geo.message)
            matches.consider(geo)
          }
        }, n += nadd)
      })
    })

    client.remote.emit('subscribe', 'geoip')
  })

  ;(function tick () {
    map.markers.age()
    dots.tick()
    window.requestAnimFrame(tick)
  }());
}

window.requestAnimFrame = (function () {
  return window.requestAnimationFrame  
      || window.webkitRequestAnimationFrame 
      || window.mozRequestAnimationFrame    
      || window.oRequestAnimationFrame      
      || window.msRequestAnimationFrame     
      || function (callback, el) {
        return window.setTimeout(callback, 1000 / 60)
      }
}());

function levenshtein (s1, s2) {
  // http://kevin.vanzonneveld.net
  // +            original by: Carlos R. L. Rodrigues (http://www.jsfromhell.com)
  // +            bugfixed by: Onno Marsman
  // +             revised by: Andrea Giammarchi (http://webreflection.blogspot.com)
  // + reimplemented by: Brett Zamir (http://brett-zamir.me)
  // + reimplemented by: Alexander M Beedie
  // *                example 1: levenshtein('Kevin van Zonneveld', 'Kevin van Sommeveld');
  // *                returns 1: 3

  if (s1 == s2) {
    return 0;
  }

  var s1_len = s1.length;
  var s2_len = s2.length;
  if (s1_len === 0) {
    return s2_len;
  }
  if (s2_len === 0) {
    return s1_len;
  }

  // BEGIN STATIC
  var split = false;
  try{
    split=!('0')[0];
  } catch (e){
    split=true; // Earlier IE may not support access by string index
  }
  // END STATIC
  if (split){
    s1 = s1.split('');
    s2 = s2.split('');
  }

  var v0 = new Array(s1_len+1);
  var v1 = new Array(s1_len+1);

  var s1_idx=0, s2_idx=0, cost=0;
  for (s1_idx=0; s1_idx<s1_len+1; s1_idx++) {
    v0[s1_idx] = s1_idx;
  }
  var char_s1='', char_s2='';
  for (s2_idx=1; s2_idx<=s2_len; s2_idx++) {
    v1[0] = s2_idx;
    char_s2 = s2[s2_idx - 1];

    for (s1_idx=0; s1_idx<s1_len;s1_idx++) {
      char_s1 = s1[s1_idx];
      cost = (char_s1 == char_s2) ? 0 : 1;
      var m_min = v0[s1_idx+1] + 1;
      var b = v1[s1_idx] + 1;
      var c = v0[s1_idx] + cost;
      if (b < m_min) {
        m_min = b; }
      if (c < m_min) {
        m_min = c; }
      v1[s1_idx+1] = m_min;
    }
    var v_tmp = v0;
    v0 = v1;
    v1 = v_tmp;
  }
  return v0[s1_len];
}