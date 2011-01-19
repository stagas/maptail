# maptail.js

Creates a server, monitors a tail -f output for IP addresses, GeoIPs them and sends them to a map. 
Run it and visit http://yourhost.com/map

### Installation

Clone this repository.

### Usage

    ./maptail.js <file_to_tail> [host] [port]

You also need to download GeoIP City Lite Edition [Download](http://geolite.maxmind.com/download/geoip/database/GeoLiteCity.dat.gz) 
and extract it into the repository folder.

### Credits

This is based on [mape's wargames](https://github.com/mape/node-wargames).

Could not be possible without [kuno's GeoIP](https://github.com/kuno/GeoIP) module.
