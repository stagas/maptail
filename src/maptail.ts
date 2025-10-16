import fs from 'fs'
import fsp from 'fs/promises'
import { hookStd } from 'hook-std'
import http from 'http'
import { IP2Location, IPTools } from 'ip2location-nodejs'
import { packageDirectorySync } from 'package-directory'
import path from 'path'
import unzipper from 'unzipper'

const root = packageDirectorySync()
const db5lite = 'node_modules/db5lite/db5lite'
let hasInited = false

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

async function unzipZips() {
  const zips = [
    path.join(root, db5lite, 'DB5LITEBIN.zip'),
    path.join(root, db5lite, 'DB5LITEBINIPV6.zip'),
  ]
  await Promise.all(zips.map(ensureExtract))
}

async function fetchCities() {
  const url = 'https://api.travelpayouts.com/data/en/cities.json'
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
console.log('[maptail] Unzipping IP2Location zips')
await unzipZips()
console.log('[maptail] Unzipped IP2Location zips')

console.log('[maptail] Fetching cities from Travelpayouts')
await fetchCities()
console.log('[maptail] Fetched cities from Travelpayouts')

hasInited = true

const ip2locationIpv4 = new IP2Location()
const ip2locationIpv6 = new IP2Location()

ip2locationIpv4.open(path.join(root, db5lite, 'DB5LITEBIN/DB5LITEBIN/IP2LOCATION-LITE-DB5.BIN'))
ip2locationIpv6.open(
  path.join(root, db5lite, 'DB5LITEBINIPV6/DB5LITEBINIPV6/IP2LOCATION-LITE-DB5.IPV6.BIN'),
)

const ipTools = new IPTools()

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
    ip,
    country,
    region,
    city,
    code: findCityCode(countryCode, city) || findCityCode(countryCode, region) || '0',
    latitude,
    longitude,
  }
}

// Reusable middleware for maptail functionality
const clients = new Set<http.ServerResponse>()
const RECENT_CAPACITY = 50
const recentEvents: unknown[] = []
const recentLogs: string[] = []

function writeSse(res: http.ServerResponse, event: unknown, eventName?: string) {
  if (eventName) res.write(`event: ${eventName}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}
type Options = {
  silent?: boolean
  logs?: boolean
}
/**
 * Creates a reusable maptail middleware that serves static files and provides SSE events
 * under the specified base path.
 *
 * @param basePath - The base path under which all static files and SSE events will be served
 * @returns A middleware function that can be used with http.createServer()
 *
 * @example
 * // Serve under /maptail path
 * const server = http.createServer(maptail('/maptail'))
 *
 * @example
 * // Serve under root path
 * const server = http.createServer(maptail('/'))
 */
export function maptail(basePath: string, options: Options = {}) {
  // Ensure basePath starts with / and ends without /
  const normalizedPath = basePath.startsWith('/') ? basePath : `/${basePath}`
  const cleanPath = normalizedPath.endsWith('/') ? normalizedPath.slice(0, -1) : normalizedPath

  const oldWrite = process.stdout.write
  hookStd(line => {
    if (!options.silent) oldWrite.call(process.stdout, line)
    if (!hasInited) return
    const ips = extractIps(line)
    ips.forEach(emit)
    if (options.logs) emitLog(line)
  })

  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    try {
      if (!req.url) {
        res.statusCode = 400
        res.end('Bad Request')
        return
      }

      // Check if request is for maptail-events endpoint
      if (req.url === `${cleanPath}/events`) {
        req.socket.setNoDelay(true)
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        })
        res.write(': connected\n\n')
        clients.add(res)
        // Replay recent geo events to new client (do not replay logs to avoid flooding UI)
        for (const event of recentEvents) writeSse(res, event)
        for (const log of recentLogs) writeSse(res, log, 'log')
        req.on('close', () => {
          clients.delete(res)
        })
        return
      }

      // Check if request is under our base path
      if (!req.url.startsWith(cleanPath)) {
        res.statusCode = 404
        res.end('Not Found')
        return
      }

      // Handle trailing slash redirect
      if (req.url === cleanPath) {
        res.writeHead(301, { Location: `${cleanPath}/` })
        res.end()
        return
      }

      // Remove base path from URL to get the actual file path
      const relativePath = req.url.slice(cleanPath.length)
      const filePath =
        relativePath === '/' || relativePath === ''
          ? path.join(root, 'public', 'index.html')
          : path.join(root, 'public', relativePath.replace(/^\//, ''))

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
  }
}

export async function emit(ip: string) {
  const data = await getIpData(ip)
  // Store in recent ring buffer
  recentEvents.push(data)
  if (recentEvents.length > RECENT_CAPACITY) recentEvents.shift()
  for (const client of clients) writeSse(client, data)
}

export function emitLog(line: string) {
  recentLogs.push(line)
  if (recentLogs.length > RECENT_CAPACITY) recentLogs.shift()
  for (const client of clients) writeSse(client, line, 'log')
}

export function close() {
  ip2locationIpv4.close()
  ip2locationIpv6.close()
}
