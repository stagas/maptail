# maptail.js

Creates a server, monitors a tail -f output for IP addresses, GeoIPs them and sends them to a map. 
Run it and visit http://yourhost.com/map

<img src="http://dl.dropbox.com/u/396087/maptail.png" border="0" />

### Installation

Grab [npm](http://npmjs.org) and:

    npm install maptail

Tested and working with node.js v0.4.4.

### Usage

    maptail <file_to_tail> [host] [port]

### Credits

This is based on [mape's wargames](https://github.com/mape/node-wargames).

Could not be possible without [kuno's GeoIP](https://github.com/kuno/GeoIP) module.

### Resources

[Latest GeoIP City Lite Edition](http://geolite.maxmind.com/download/geoip/database/GeoLiteCity.dat.gz)
