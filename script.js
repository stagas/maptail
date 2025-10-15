const getImageForCityCode = cityCode =>
  `https://photo.hotellook.com/static/cities/256x192/${cityCode}.jpg`

function initializeMap() {
  const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json', // stylesheet location
    center: [0, 45], // starting position [lng, lat]
    zoom: 1, // starting zoom
    renderWorldCopies: false, // disable horizontal world wrapping
  })

  // Keep track of markers keyed by lng,lat to avoid duplicates
  const coordToMarker = new Map()
  const ttlMs = 60_000
  const tickMs = 1_000

  const buildPopupContent = async ({ country, region, city, code }) => {
    const popupContent = document.createElement('div')
    popupContent.innerHTML = [country, region, city]
      .filter(Boolean)
      .map(v => `<div>${v}</div>`)
      .join('')
    const image = document.createElement('img')
    image.src = getImageForCityCode(code)
    try {
      await image.decode()
    } catch (e) {
      console.error(e)
    }
    popupContent.appendChild(image)
    return popupContent
  }

  const addMarkerWithHover = async ({ country, region, city, code, latitude, longitude }) => {
    const coords = [Number(longitude) || 0, Number(latitude) || 0]
    const key = `${coords[0]},${coords[1]}`

    const popupContent = await buildPopupContent({ country, region, city, code })
    let entry = coordToMarker.get(key)

    if (!entry) {
      const el = document.createElement('div')
      el.style.cssText = [
        'width:8px',
        'height:8px',
        'pointer-events:auto',
        'cursor:default',
        'opacity:1',
      ].join(';')

      const dot = document.createElement('div')
      dot.style.cssText = [
        'width:100%',
        'height:100%',
        'border-radius:50%',
        'background:#ff3d00',
        'box-shadow:0 0 0 2px rgba(255,61,0,0.25)',
        'transform:scale(1)',
        'transform-origin:center',
        'transition:transform 750ms ease-in',
      ].join(';')
      el.appendChild(dot)

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coords)
        .addTo(map)

      // creation attention animation on inner dot: start larger, then shrink
      requestAnimationFrame(() => {
        dot.style.transform = 'scale(8)'
        requestAnimationFrame(() => {
          dot.style.transform = 'scale(1)'
        })
      })

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'geo-popup',
      })

      const markerEl = marker.getElement()

      markerEl.addEventListener('mouseenter', () => {
        popup.setDOMContent(popupContent)
        popup.setLngLat(coords).addTo(map)
        const popupEl = popup.getElement()
        setTimeout(() => {
          popupEl.classList.add('fade-in')
        }, 50)
      })

      markerEl.addEventListener('mouseleave', () => {
        try {
          const popupEl = popup.getElement()
          popupEl.classList.remove('fade-in')
          setTimeout(() => {
            try {
              popup.remove()
            } catch (e) {}
          }, 1100)
        } catch (e) {}
      })

      entry = { marker, popup, el: marker.getElement(), createdAt: Date.now() }
      coordToMarker.set(key, entry)
    }

    // Always update the popup content for this location with latest data
    try {
      entry.popup.setDOMContent(popupContent)
    } catch (e) {}

    // Reset age and opacity on repeat events
    entry.createdAt = Date.now()
    if (entry.el) entry.el.style.opacity = '1'
  }

  const es = new EventSource('/events')
  es.onmessage = ev => {
    try {
      const data = JSON.parse(ev.data)
      addMarkerWithHover(data).catch(e => {
        console.error(e)
      })
    } catch (e) {}
  }
  // Fade out and remove old markers
  setInterval(() => {
    const now = Date.now()
    coordToMarker.forEach((entry, key) => {
      const age = now - (entry.createdAt || now)
      const t = Math.min(Math.max(age / ttlMs, 0), 1)
      const opacity = 1 - t
      if (opacity <= 0) {
        try {
          entry.popup.remove()
        } catch (e) {}
        try {
          entry.marker.remove()
        } catch (e) {}
        coordToMarker.delete(key)
      } else {
        if (entry.el) entry.el.style.opacity = String(opacity)
      }
    })
  }, tickMs)
}

initializeMap()
