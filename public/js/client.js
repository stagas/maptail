(function () {
  $.fn.reverse = [].reverse
  
	if (!window.WebSocket) {
		$('body').empty();
		alert('This page requires Websocket support. Please use Chrome or Safari.');
	}

	setTimeout(function () {
		new ircMap({
			bowArcHeight: 200, // px
			bowArcHeightVsDistance: 400 // px
		});
	});

	function ircMap(options) {
		var bowArcHeight = options.bowArcHeight || 200;
		var bowArcHeightVsDistance = options.bowArcHeightVsDistance || 400;

		var linkTimeout;
		var removeTimeout;
		var users = {};
		var markers = {};
		var $map = $('#map');
		var mapNewWidth = $map.width() * 0.9;
		var mapNewHeight = mapNewWidth * 0.9;
		var mapHeight = $map.height(mapNewHeight).height();
		var mapWidth = $map.width(mapNewWidth).width();
		var mapOffsetX;
		var mapOffsetY;
		var timeDiff = 0;

		$('<div id="map-canvas"/>').appendTo('#map').width(mapWidth).height(mapHeight);

		var map = Raphael($('#map-canvas').get(0), mapWidth, mapHeight);
		map.canvas.setAttribute('viewBox', '0 0 567 369');

		var mapSourceDiffX = (567 / $('#map').width());
		var mapSourceDiffY = (369 / $('#map').height());

		map.path(mapVector).attr({
			stroke: "#333"
		}).attr({
			'stroke-width': 0.7
		});

		$map.addClass('centered').css({
			'margin-top': '-' + ((mapHeight / 2) + 200) + 'px',
			'margin-left': '-' + (mapWidth / 2) + 'px'
		});

		$('.marker').live('mouseover', function (event) {
			var lastActivity = $(this).attr('data-activity');
			var $counter = $('<div class="lastActivity">active <span></span> sec ago</div>').appendTo(this).find('span');

			function updateTime() {
				var diff = new Date().getTime(new Date().getTime() + timeDiff) - (lastActivity - timeDiff);
				$counter.text(toFixed((diff / 1000), 2));
			}
			updateTime();
			var activityInterval = setInterval(updateTime, 10);

			$(this).data('activity', activityInterval);
			$('.marker').addClass('dampened');

		}).live('mouseout', function (event) {
			clearTimeout($(this).data('activity'));
			$(this).find('.lastActivity').remove();;
			$('.marker').removeClass('dampened');
		});

		function updateMarker(markersCollection) {
			if (markersCollection.element) {
				markersCollection = [markersCollection];
			}

			$.each(markersCollection, function (index) {
				var marker = this;

				if (marker.element && marker.isNew) {
					marker.isNew = false;

					blinkMarker(marker, true, function () {
						startAging(marker);
					});
				}
				else if (marker.element) {
					marker.element.css('opacity', '').attr('data-activity', users[marker.key].lastActivity);

					blinkMarker(marker, false, function () {
						startAging(marker);
					});
				}

				function blinkMarker(marker, firstTime, callback) {
					setTimeout(function () {
						var count = 1200;
						if (firstTime) {
							marker.element.toggleClass('origin middle');
						}
						else {
							count = 2400;
						}
						while (count > 0) {
							setTimeout(function () {
								marker.element.toggleClass('standard middle');
							}, count);
							count -= 400;
						}

						setTimeout(callback, count + 10);
					}, 10);
				}

				function startAging(marker) {
					if (marker.dying && marker.dying.length) {
						marker.dying.forEach(function (timeout) {
							clearTimeout(timeout);
						});
					}

					var diff = new Date().getTime(new Date().getTime() + timeDiff) - (users[marker.key].lastActivity - timeDiff);

					for (var i = 0; i < 60; i++) {
						(function (i) {
							marker.dying.push(setTimeout(function () {
								marker.element.css('opacity', 1 - i / 60);
							}, (i * (removeTimeout / 60)) - diff));
						})(i);
					};

					if (marker.dieTimeout) {
						clearTimeout(marker.dieTimeout);
					}
					marker.dieTimeout = setTimeout(function () {
						marker.element.remove();
						marker.userlistEntry.remove();
						delete markers[marker.key];
					}, removeTimeout - diff);
				}
			});
		}

		function toFixed(str, dec) {
			var m = Math.pow(10, dec);
			var number = Math.round(str * m, 0) / m;
			if (number.toString().indexOf('.') === -1) {
				number += '.0';
			}
			if (!number.toString().match(/\.[0-9]{2}/)) {
				number += '0';
			}
			if (number.toString().indexOf('-') !== -1) {
				number = '0.00';
			}
			return number;
		}

		function createMarker(user) {
			if (user && !markers[user]) {
				user = users[user];
				var id = user.name;

				var coords = latLngToPx(user.lat, user.lng);
				if (user.lat == 'error' || !user.lat) {
					coords = latLngToPx(67.851563, 76.639226);
				}

				var x = coords.x;
				var y = coords.y;

				var $marker = $('<div data-activity="' + user.lastActivity + '" class="marker origin"><div class="meta">' + (user.name || '') + (user.city.country_name ? ' (' + (user.city.city ? user.city.city + ' / ' : '') + user.city.country_name + ')' : '') + '</div><img src="/img/marker.png"></div>').css({
					left: x + 'px',
					top: y + 'px'
				}).appendTo($map);

				var $userListEntry = $('<li>' + id + (user.city.country_name ? ' (' + (user.city.city ? user.city.city + ' / ' : '') + user.city.country_name + ')' : '') + '</li>').hover(function () {
					$marker.addClass('hover').trigger('mouseover');
				}, function () {
					$marker.removeClass('hover').trigger('mouseout');
				}).prependTo('#userlist');

				markers[id] = {
					key: id,
					element: $marker,
					userlistEntry: $userListEntry,
					y: y || 0,
					x: x || 0,
					dying: [],
					isNew: true
				};

				updateMarker(markers[id]);
			}
		}

		function latLngToPx(lat, lng) {
			lng = parseFloat(lng);
			lat = parseFloat(lat);

			var x = (mapWidth * (180 + lng) / 360) % mapWidth;

			lat = lat * Math.PI / 180;
			var y = Math.log(Math.tan((lat / 2) + (Math.PI / 4)));
			y = (mapHeight / 2) - (mapWidth * y / (2 * Math.PI));

			if (!mapOffsetX) {
				mapOffsetX = mapWidth * 0.026;
			}
			if (!mapOffsetY) {
				mapOffsetY = mapHeight * 0.141;
			}
			return {
				x: (x - mapOffsetX) * 0.97,
				y: (y + mapOffsetY + 200),
				xRaw: x,
				yRaw: y
			};
		}

		function linkMarkers(sender, reciever) {
			if (!sender || !reciever) {
				return false;
			}
			if (!markers[reciever]) {
				createMarker(reciever);
			}

			updateMarker([markers[sender], markers[reciever]]);

			sender = markers[sender];
			reciever = markers[reciever];

			var x1 = Math.floor(sender.x * mapSourceDiffX);
			var y1 = (Math.floor((sender.y - 200) * mapSourceDiffY) * 1.4) - 73;
			var x2 = Math.floor(reciever.x * mapSourceDiffX) + 2;
			var y2 = (Math.floor((reciever.y - 200) * mapSourceDiffY) * 1.4) - 73;
			var dist = Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2)) * mapSourceDiffX;
			var curviness = (dist / bowArcHeightVsDistance) * bowArcHeight;

			var path = 'M' + x1 + ',' + y1 + 'C' + x1 + ',' + (y1 - curviness) + ',' + x2 + ',' + (y2 - curviness) + ',' + x2 + ',' + y2;
			var p = map.path(path).attr({
				stroke: 'rgb(100,100,0)',
				"stroke-width": 1
			});

			for (var i = 0; i < 60; i++) {
				(function (i) {
					setTimeout(function () {
						$(p[0]).css('opacity', 1 - i / 60);
					}, i * (linkTimeout / 60));
				})(i);
			};

			setTimeout(function () {
				$(p[0]).remove();
			}, linkTimeout);
		}

		function setOptions(time) {
			removeTimeout = time || 1200000;
			linkTimeout = time / 4 || 300000;
		}

		var lastActivityInterval;
		var hasSetWidth = false;
		var $channelActivityDisplay = $('#channel-activity');

		function updateChannelActivity(time) {
			if (lastActivityInterval) {
				clearInterval(lastActivityInterval);
			}

			lastActivityInterval = setInterval(function () {
				var diff = new Date().getTime(new Date().getTime()) - (time - timeDiff);
				$channelActivityDisplay.text(toFixed((diff / 1000), 2) + 'sec');
			}, 50);

			//if (!hasSetWidth) {
				//$('#messages, #last-activity').width($('#last-activity').width() + 150);
				//hasSetWidth = true;
			//}
		}
    
		function addMessages(messages) {
			var width = $('#last-activity').width();
			var $messageContainer = $('#messages');
			$.each(messages, function (index) {
				var user = this.user;
				var message = this.message;

        var colors = {
          30: "#777",
          31: "red",
          32: "#0f0",
          33: "yellow",
          34: "blue",
          35: "magenta",
          36: "cyan",
          37: "#eee",
          38: "#777",
          39: "#777"
        }

        var style = "color:#eee;"
        var urlRegexp = new RegExp('(?:(?:(?:https?|ftp|file)://|www\.|ftp\.)[-A-Z0-9+&@#/%?=~_|$!:,.;]*[-A-Z0-9+&@#/%=~_|$]\|((?:mailto:)?[A-Z0-9._%+-]+@[A-Z0-9._%-]+\.[A-Z]{2,4})\\b)|"(?:(?:https?|ftp|file)://|www\.|ftp\.)[^"\r\n]+"?|\'(?:(?:https?|ftp|file)://|www\.|ftp\.)[^\'\r\n]+\'?', 'ig')
        
        // ansi to html coloring code from ajaxorg / cloud9
				$messageContainer.append($('<li><span class="user">' + user + ':</span><span class="message"></span></li>').find('.message').html(message
          .replace(/\033\[(?:(\d+);)?(\d+)m/g, function(m, extra, color) {
              style = "color:" + (colors[color] || "#777");
              if (extra == 1) {
                  style += ";font-weight=bold"
              } else if (extra == 4) {
                  style += ";text-decoration=underline";
              }
              return "</span><span style='" + style + "'>"
          })
          .replace(urlRegexp, function(url) {
            return '<a href="'+ url +'" target="_blank">'+ url +'</a>'
          })                
          ).end())
			});
			var len = $messageContainer.find('li').length
      if (len > 10) $messageContainer.find('li:lt(' + (len - 10) + ')').remove()
			$messageContainer.find('li:lt(9)').reverse().each(function (index) {
				$(this).css('opacity', ((0.6 / 10) * (10 - index)));
			});
		}

		function initWebsocketConnection() {
			var server = new io.Socket(null, {
				'port': WSPORT
				, 'rememberTransport': false
				, 'transports': [
					'websocket'
					, 'flashsocket'
					, 'htmlfile'
					, 'xhr-multipart'
					, 'xhr-polling'
				]
			}); 
			server.on('message', function(msg) {
				var data = JSON.parse(msg);
				var lastActivityTimestamp;

				switch (data.action) {
				case 'getUsers':
					setOptions(data.removeTimeout);
					$('#channel').text(data.channel);
					$('title').text('tail -f ' + data.channel);
					users = data.users;
					lastActivityTimestamp = 0;

					$.each(users, function (key, value) {
						if (value.lastActivity > lastActivityTimestamp) {
							lastActivityTimestamp = value.lastActivity;
						}
						createMarker(key);
					});
					timeDiff = data.serverTime - new Date().getTime();
					break;

				case 'newLink':
					linkMarkers(data.from.name, data.to.name);
					break;

				case 'newMessage':
					users[data.from.name] = data.from;
					lastActivityTimestamp = data.from.lastActivity;
					if (!users[data.from.name] || !markers[data.from.name]) {
						createMarker(data.from.name);
					}
					else {
						updateMarker(markers[data.from.name]);
					}
					break;
				}
				if (data.messageCount) {
					$('#message-count').text(data.messageCount);
				}
				if (data.messages) {
					addMessages(data.messages);
				}

				if (lastActivityTimestamp) {
					updateChannelActivity(lastActivityTimestamp);
				}
			});
			server.on('disconnect', function() {
				setTimeout(function () {
					initWebsocketConnection();
				}, 3000);
			});
			server.connect();
		}
		initWebsocketConnection();
	}
})();
