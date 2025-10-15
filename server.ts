import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import http from 'http'
import unzipper from 'unzipper'
import { IP2Location, IPTools } from 'ip2location-nodejs'
import readline from 'readline'

// Extracts a .zip into a directory named after the zip (without .zip) if missing.
async function ensureExtract(zipPath: string) {
  const { dir, name, ext } = path.parse(zipPath)
  if (ext.toLowerCase() !== '.zip') return
  const outDir = path.join(dir, name)

  try {
    const stat = await fsp.stat(outDir)
    if (stat.isDirectory()) return // directory exists; nothing to do
  } catch {
    // directory missing; proceed to extract
  }

  await fsp.mkdir(outDir, { recursive: true })

  // Wait for extraction stream to complete
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: outDir }))
      .on('close', resolve)
      .on('error', reject)
  })
}

async function fetchZips() {
  const codes = ['DB5LITEBIN', 'DB5LITEBINIPV6']
  const root = import.meta.dirname
  for (const code of codes) {
    const target = path.join(root, `${code}.zip`)
    try {
      await fsp.stat(target)
      continue // if exists, continue
    } catch {
      // file doesn't exist, proceed to download
    }
    const url = `https://www.ip2location.com/download/?token=${process.env.IP2LOCATION_TOKEN}&file=${code}`
    const response = await fetch(url)
    const body = response.body
    if (!body) throw new Error('No response body to stream')
    const fileStream = fs.createWriteStream(target)
    await new Promise<void>((resolve, reject) => {
      body
        .pipeTo(
          new WritableStream({
            write(chunk) {
              fileStream.write(chunk)
            },
            close() {
              fileStream.end()
              resolve()
            },
            abort(err) {
              fileStream.destroy()
              reject(err)
            },
          }),
        )
        .catch(reject)
    })
  }
}

async function unzipZips() {
  const root = import.meta.dirname
  const zips = [path.join(root, 'DB5LITEBIN.zip'), path.join(root, 'DB5LITEBINIPV6.zip')]
  await Promise.all(zips.map(ensureExtract))
}

async function fetchCities() {
  const url = 'https://api.travelpayouts.com/data/en/cities.json'
  const root = import.meta.dirname
  const target = path.join(root, 'cities.json')
  try {
    await fsp.stat(target)
    return // if exists, continue
  } catch {
    // file doesn't exist, proceed to download
  }
  const response = await fetch(url)
  const body = response.body
  if (!body) throw new Error('No response body to stream')
  const fileStream = fs.createWriteStream(target)
  await new Promise<void>((resolve, reject) => {
    body
      .pipeTo(
        new WritableStream({
          write(chunk) {
            fileStream.write(chunk)
          },
          close() {
            fileStream.end()
            resolve()
          },
          abort(err) {
            fileStream.destroy()
            reject(err)
          },
        }),
      )
      .catch(reject)
  })
}

// Run once on import
console.log('Fetching and unzipping zips')
await fetchZips()
await unzipZips()
console.log('Fetched and unzipped zips')

console.log('Fetching cities')
await fetchCities()
console.log('Fetched cities')

const root = import.meta.dirname
const ip2locationIpv4 = new IP2Location()
const ip2locationIpv6 = new IP2Location()

ip2locationIpv4.open(path.join(root, 'DB5LITEBIN/IP2LOCATION-LITE-DB5.BIN'))
ip2locationIpv6.open(path.join(root, 'DB5LITEBINIPV6/IP2LOCATION-LITE-DB5.IPV6.BIN'))

const ipTools = new IPTools()

const type = {
  name_translations: {
    en: 'Senggo',
  },
  cases: {
    su: 'Senggo',
  },
  country_code: 'ID',
  code: 'ZEG',
  time_zone: 'Asia/Jayapura',
  name: 'Senggo',
  coordinates: {
    lat: -5.983333,
    lon: 139.36667,
  },
  has_flightable_airport: false,
}

type City = {
  name_translations: {
    en: string
  }
  country_code: string
  code: string
}

const cities = JSON.parse(await fsp.readFile(path.join(root, 'cities.json'), 'utf-8')) as City[]

function findCityCode(countryCode: string, cityName: string): string | undefined {
  const term = cityName.toLowerCase()
  return cities
    .filter(
      c => c.name_translations.en.toLowerCase().includes(term) && c.country_code === countryCode,
    )
    .map(c => c.code)[0]
}

// Extracts unique IPv4 and IPv6 addresses present in arbitrary text.
export function extractIps(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  // First pass: tokenize on common separators to catch typical cases.
  for (const raw of text.split(/[\s,;()\[\]{}<>]+/g)) {
    const t = raw.replace(/^[^\w:]*|[^\w:.%]*$/g, '')
    if (!t) continue
    if (ipTools.isIPV4(t) || ipTools.isIPV6(t)) {
      if (!seen.has(t)) {
        seen.add(t)
        out.push(t)
      }
    }
  }

  // Second pass: strong IPv4 pattern to catch adjacent punctuation cases.
  const v4re = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g
  for (const m of text.matchAll(v4re)) {
    const t = m[0]
    if (!seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }

  // Third pass: bracketed hosts like [2001:db8::1]:443
  for (const m of text.matchAll(/\[([0-9A-Fa-f:%.]+)\]/g)) {
    const t = m[1]
    if ((ipTools.isIPV6(t) || ipTools.isIPV4(t)) && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }

  return out
}

async function getIpData(ip: string) {
  const ip2Location = ipTools.isIPV4(ip) ? ip2locationIpv4 : ip2locationIpv6
  const [countryCode, country, region, city, latitude, longitude] = await Promise.all([
    ip2Location.getCountryShortAsync(ip),
    ip2Location.getCountryLongAsync(ip),
    ip2Location.getRegionAsync(ip),
    ip2Location.getCityAsync(ip),
    ip2Location.getLatitudeAsync(ip),
    ip2Location.getLongitudeAsync(ip),
  ])

  return {
    country,
    region,
    city,
    code: findCityCode(countryCode, city) || findCityCode(countryCode, region) || '0',
    latitude,
    longitude,
  }
}

// Simple static server with SSE endpoint
const clients = new Set<http.ServerResponse>()

function writeSse(res: http.ServerResponse, event: unknown) {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      res.statusCode = 400
      res.end('Bad Request')
      return
    }

    if (req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })
      res.write(': connected\n\n')
      clients.add(res)
      req.on('close', () => {
        clients.delete(res)
      })
      return
    }

    const filePath =
      req.url === '/' ? path.join(root, 'index.html') : path.join(root, req.url.replace(/^\//, ''))

    const ext = path.extname(filePath).toLowerCase()
    const type =
      ext === '.html'
        ? 'text/html; charset=utf-8'
        : ext === '.js'
        ? 'application/javascript; charset=utf-8'
        : ext === '.css'
        ? 'text/css; charset=utf-8'
        : 'application/octet-stream'

    const data = await fsp.readFile(filePath)
    res.writeHead(200, { 'Content-Type': type })
    res.end(data)
  } catch (err) {
    res.statusCode = 404
    res.end('Not Found')
  }
})

const PORT = Number(process.env.PORT || 3000)
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})

// Stream from stdin, extract unique IPs, then resolve their geo data and forward via SSE.
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

export async function emit(ip: string) {
  const data = await getIpData(ip)
  for (const client of clients) writeSse(client, data)
}

for await (const line of rl) {
  const ips = extractIps(line)
  await Promise.all(ips.map(emit))
}

ip2locationIpv4.close()
ip2locationIpv6.close()
