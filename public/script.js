const getImageForCityCode = cityCode =>
  `https://photo.hotellook.com/static/cities/512x320/${cityCode}.jpg`

function initializeMap() {
  const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json', // stylesheet location
    center: [0, 13], // starting position [lng, lat]
    zoom: 1, // starting zoom
    renderWorldCopies: false, // disable horizontal world wrapping
  })

  // Keep track of markers keyed by lng,lat to avoid duplicates
  const coordToMarker = new Map()
  const MAX_MARKERS = 200
  const markerSize = 16
  const ttlMs = 60_000
  const tickMs = 1_000
  const overlayCanvas = document.getElementById('overlay-canvas')
  const ctx = overlayCanvas?.getContext('2d')
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
  const canvasLines = []
  let appliedScroll = 0
  let pendingScroll = 0
  let lastRenderTs = performance.now()
  const minScrollSpeed = 10
  const maxScrollSpeed = 1000
  let incomingRatePxPerSec = 0
  let lastEnqueueTs = performance.now()
  const removeFadeMs = 200
  const VISIBLE_LINES = 15
  const MAX_OVERLAY_LINES = VISIBLE_LINES + 1
  let lineHeight = 16
  const lineSpacing = 0 // no spacing between lines
  const sidePadding = 0
  const bottomPadding = 0
  const fontSpec =
    '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  const bgColor = 'rgba(16,16,20,0.65)'
  const borderColor = 'rgba(255,255,255,0.07)'
  const textColor = '#e8e8eb'

  function resizeCanvas() {
    if (!overlayCanvas || !ctx) return
    const cssWidth = overlayCanvas.clientWidth || window.innerWidth
    // set font to measure accurate line height
    ctx.font = fontSpec
    ctx.textBaseline = 'top'
    const m = ctx.measureText('Mg')
    const measured = Math.ceil(
      (m.actualBoundingBoxAscent || 12) + (m.actualBoundingBoxDescent || 4),
    )
    if (measured > 0) lineHeight = measured
    const cssHeight = VISIBLE_LINES * lineHeight
    overlayCanvas.style.height = `${cssHeight}px`
    overlayCanvas.width = Math.floor(cssWidth * dpr)
    overlayCanvas.height = Math.floor(cssHeight * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas, { passive: true })

  function enqueueCanvasLine(text) {
    if (!ctx) return
    const now = performance.now()
    // update EMA of incoming pixels/sec
    const dtSec = Math.max(0.001, (now - lastEnqueueTs) / 1000)
    while (canvasLines.length >= MAX_OVERLAY_LINES) {
      const removed = canvasLines.shift()
      if (removed) {
        // schedule removal fade then actual removal
        removed.removeAt = now + removeFadeMs
        // keep it in a temp list to process removal in render loop
        // but since we shifted it, push to front to keep order during fade
        canvasLines.unshift(removed)
        break
      }
    }
    const textHeight = lineHeight
    const boxHeight = lineHeight
    const last = canvasLines[canvasLines.length - 1]
    const stackOffset = last ? last.stackOffset + last.boxHeight + lineSpacing : 0
    const item = { text, createdAt: now, boxHeight, stackOffset }
    canvasLines.push(item)
    // Place new line just beyond the visible area by bumping its stack offset
    // so it starts off-screen and scrolls in
    const visibleHeight = VISIBLE_LINES * (lineHeight + lineSpacing) - lineSpacing
    const overshoot = Math.max(0, appliedScroll + visibleHeight - (stackOffset + boxHeight))
    // Keep stacking contiguous; only increase scroll distance so the new line starts off-screen and scrolls in
    pendingScroll += boxHeight + lineSpacing + overshoot
    const pixelsAdded = boxHeight + lineSpacing
    const rateSample = pixelsAdded / dtSec
    const alpha = 0.25
    incomingRatePxPerSec = incomingRatePxPerSec * (1 - alpha) + rateSample * alpha
    lastEnqueueTs = now
  }

  function rebaseAfterRemoval(removed, removedIndex) {
    const delta = (removed.boxHeight || 0) + lineSpacing
    // Smoothly consume the gap by scrolling up
    pendingScroll += delta
    for (let i = removedIndex; i < canvasLines.length; i++) canvasLines[i].stackOffset -= delta
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3)
  }

  function renderCanvas() {
    if (!overlayCanvas || !ctx) return
    const width = overlayCanvas.width / dpr || overlayCanvas.clientWidth || window.innerWidth
    const height = overlayCanvas.height / dpr || VISIBLE_LINES * lineHeight

    const now = performance.now()
    const dt = Math.max(0, Math.min(0.1, (now - lastRenderTs) / 1000)) // clamp dt
    lastRenderTs = now

    ctx.clearRect(0, 0, width, height)
    ctx.font = fontSpec
    ctx.textBaseline = 'top'

    // handle scheduled removals (cap-induced) with fade-out while keeping space until done
    for (let i = 0; i < canvasLines.length; ) {
      const it = canvasLines[i]
      if (it.removeAt && now >= it.removeAt) {
        const removed = canvasLines.splice(i, 1)[0]
        rebaseAfterRemoval(removed, i)
        continue
      }
      i++
    }

    // Advance scroll at a fixed speed consuming pendingScroll (typewriter style)
    const remaining = pendingScroll
    // decay incoming rate slowly in absence of new lines
    const decay = 0.15
    incomingRatePxPerSec = Math.max(0, incomingRatePxPerSec * (1 - decay * dt))
    const dynamicSpeed = Math.min(
      maxScrollSpeed,
      Math.max(minScrollSpeed, incomingRatePxPerSec * 1.1 + minScrollSpeed),
    )
    const maxStep = dynamicSpeed * dt
    const step = Math.min(remaining, maxStep)
    appliedScroll += step
    pendingScroll -= step
    // Keep bottom-most line anchored: never scroll beyond last line's offset
    const lastOffsetForClamp = canvasLines.length
      ? canvasLines[canvasLines.length - 1].stackOffset
      : 0
    if (appliedScroll > lastOffsetForClamp) appliedScroll = lastOffsetForClamp

    const visible = canvasLines.slice(-MAX_OVERLAY_LINES)

    const maxBoxWidth = Math.max(0, width - sidePadding * 2)
    const baseY = height - bottomPadding
    const lastOffset = canvasLines.length ? canvasLines[canvasLines.length - 1].stackOffset : 0
    for (let i = visible.length - 1; i >= 0; i--) {
      const item = visible[i]
      // measure width per frame to account for resize
      const metrics = ctx.measureText(item.text)
      const textWidth = Math.ceil(metrics.width)
      const textHeight = lineHeight
      const boxHeight = item.boxHeight
      const boxWidth = Math.min(textWidth + sidePadding * 2, maxBoxWidth)

      const removingT = item.removeAt
        ? Math.min(Math.max((item.removeAt - now) / removeFadeMs, 0), 1)
        : 1
      const opacity = removingT
      const rise = 0

      const x = sidePadding
      const drawY = baseY - (appliedScroll - item.stackOffset) - boxHeight - rise

      ctx.globalAlpha = opacity
      ctx.fillStyle = textColor
      ctx.fillText(item.text, x + sidePadding, drawY)
    }

    // Apply a vertical alpha gradient mask so lines smoothly disappear toward the top
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'destination-in'
    const grad = ctx.createLinearGradient(0, 0, 0, height)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(0.2, 'rgba(0,0,0,0.2)')
    grad.addColorStop(0.5, 'rgba(0,0,0,0.6)')
    grad.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'

    requestAnimationFrame(renderCanvas)
  }
  requestAnimationFrame(renderCanvas)
  // No shared popup - each marker will have its own popup

  // Ensure we never exceed the max number of markers by removing oldest first
  const ensureMarkerCapacity = () => {
    const over = coordToMarker.size - MAX_MARKERS + 1
    if (over <= 0) return
    const oldest = [...coordToMarker.entries()]
      .sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0))
      .slice(0, over)
    for (const [k, e] of oldest) {
      try {
        e.marker.remove()
        if (e.popup) e.popup.remove()
      } catch (e) {}
      coordToMarker.delete(k)
    }
  }

  const buildPopupContent = ({ ip, country, region, city, code }) => {
    const popupContent = document.createElement('div')
    popupContent.innerHTML = [city, region, country, ip]
      .filter(Boolean)
      .map(
        (v, i) =>
          `<div style="font-size:${
            i === 0 ? '16pt' : i === 1 ? '14pt' : '12pt'
          }; line-height:0; margin: 30px 0; ${
            i === 0 ? 'margin-top: 10px;' : i === 3 ? 'margin-bottom: 10px;' : ''
          }">${v}</div>`,
      )
      .join('')

    // Create image placeholder - will load when popup opens
    const image = document.createElement('img')
    image.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;border-radius:0.5rem;object-fit:cover;z-index:-1;'
    popupContent.appendChild(image)

    // Store the image loading function for later
    popupContent._loadImage = async () => {
      if (!image.src) {
        image.src = getImageForCityCode(code)
        try {
          await image.decode()
        } catch (e) {
          console.error('Image load error:', e)
        }
      }
    }

    return popupContent
  }

  const addMarkerWithHover = async ({ ip, country, region, city, code, latitude, longitude }) => {
    const coords = [Number(longitude) || 0, Number(latitude) || 0]
    const key = code && code !== '0' ? `city:${code}` : `coord:${coords[0]},${coords[1]}`

    // If a marker already exists for this city, remove it so creation anim runs again
    let entry = coordToMarker.get(key)
    if (entry) {
      try {
        entry.marker.remove()
        if (entry.popup) entry.popup.remove()
      } catch (e) {}
      coordToMarker.delete(key)
      entry = null
    }

    if (!entry) {
      // make room for the new marker if we're at capacity
      ensureMarkerCapacity()

      // Create marker element
      const el = document.createElement('div')
      el.setAttribute('data-geo-marker', '1')
      el.style.cssText = [
        `width:${markerSize}px`,
        `height:${markerSize}px`,
        'display:flex',
        'justify-content:center',
        'align-items:center',
        'pointer-events:auto',
        'cursor:default',
        'opacity:1',
      ].join(';')

      const dot = document.createElement('div')
      dot.style.cssText = [
        'width:25%',
        'height:25%',
        'border-radius:50%',
        'background:#ffff00',
        'box-shadow:0 0 0 1px rgba(255,255,0,0.25)',
        'transform:scale(1)',
        'transform-origin:center',
        'transition:transform 750ms ease-in',
      ].join(';')
      el.appendChild(dot)

      // Create marker
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coords)
        .addTo(map)

      // Create individual popup for this marker
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'geo-popup',
      })

      // Build popup content (without loading images yet)
      const popupContent = buildPopupContent({ ip, country, region, city, code })
      popup.setDOMContent(popupContent)
      popup.setLngLat(coords)

      // Add hover events
      const markerEl = marker.getElement()
      markerEl.addEventListener('mouseenter', () => {
        console.log('Mouse enter on marker:', key)
        // Load image when popup opens
        if (popupContent._loadImage) {
          popupContent._loadImage()
        }
        try {
          popup.addTo(map)
          // Add fade-in class to make popup visible
          const popupEl = popup.getElement()
          if (popupEl) {
            popupEl.classList.add('fade-in')
          }
          console.log('Popup added to map')
        } catch (e) {
          console.error('Error adding popup to map:', e)
        }
      })
      markerEl.addEventListener('mouseleave', () => {
        console.log('Mouse leave on marker:', key)
        try {
          // Fade out before removing
          const popupEl = popup.getElement()
          if (popupEl) {
            popupEl.classList.remove('fade-in')
            // Wait for fade-out animation to complete before removing
            setTimeout(() => {
              popup.remove()
              console.log('Popup removed from map')
            }, 120) // Match CSS transition duration
          } else {
            popup.remove()
            console.log('Popup removed from map')
          }
        } catch (e) {
          console.error('Error removing popup from map:', e)
        }
      })

      // creation attention animation on inner dot: start larger, then shrink
      requestAnimationFrame(() => {
        dot.style.transform = 'scale(16)'
        requestAnimationFrame(() => {
          dot.style.transform = 'scale(1)'
        })
      })

      entry = {
        marker,
        popup,
        el: marker.getElement(),
        createdAt: Date.now(),
        coords,
        placeData: { country, region, city, code },
      }
      coordToMarker.set(key, entry)
    }

    // Reset age and opacity on repeat events
    entry.createdAt = Date.now()
    entry.coords = coords
    entry.placeData = { country, region, city, code }
    if (entry.el) entry.el.style.opacity = '1'
  }

  const es = new EventSource('events')
  es.onmessage = ev => {
    try {
      const data = JSON.parse(ev.data)
      addMarkerWithHover(data).catch(e => {
        console.error(e)
      })
    } catch (e) {}
  }
  es.addEventListener('log', ev => {
    try {
      enqueueCanvasLine(JSON.parse(ev.data))
    } catch (e) {}
  })
  // Fade out and remove old markers
  setInterval(() => {
    const now = Date.now()
    coordToMarker.forEach((entry, key) => {
      const age = now - (entry.createdAt || now)
      const t = Math.min(Math.max(age / ttlMs, 0), 1)
      const opacity = 1 - t
      if (opacity <= 0) {
        try {
          entry.marker.remove()
          if (entry.popup) entry.popup.remove()
        } catch (e) {}
        coordToMarker.delete(key)
      } else {
        if (entry.el) entry.el.style.opacity = String(opacity)
      }
    })
  }, tickMs)
}

initializeMap()
