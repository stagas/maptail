var fs = require('fs')
var colors = require('colors')
var file = fs.createWriteStream('dummy-log')

function rand () {
  return Math.floor(Math.random() * 256)
}

var i = 0
setInterval(function () {
  if (Math.random() * 10 < 5) file.write((i++) + 'gibb'.red + 'er'.yellow + 'ish '.green + [0,0,0,0].map(rand).join('.') + ' more'.cyan + ' gibb'.magenta + 'erish'.blue + '\r\n')
  else if (Math.random() * 10 > 9) file.write((i++) + ' more gibberish with no ip\n')
}, 10)
