import { setTimeout as delay } from 'timers/promises'

// Generates fake web server logs with random IPv4/IPv6 addresses.
// Biases toward public routable ranges; avoids private/reserved spaces.

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

const methods: Method[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
const statuses = [200, 200, 200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 429, 500, 502, 503]
const paths = [
  '/',
  '/home',
  '/products',
  '/products/123',
  '/cart',
  '/checkout',
  '/api/v1/users',
  '/api/v1/orders',
  '/search?q=shoes',
  '/login',
  '/logout',
  '/about',
]
const userAgents = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'curl/8.7.1',
  'okhttp/4.12.0',
]
const referrers = [
  '-',
  'https://www.google.com/',
  'https://www.bing.com/',
  'https://news.ycombinator.com/',
  'https://twitter.com/',
  'https://github.com/',
]

// A small set of popular city names used only to season querystrings and paths
// to hint at geography without needing accurate geolocation.
const cities = [
  'New York',
  'London',
  'Tokyo',
  'Paris',
  'Los Angeles',
  'Singapore',
  'Sydney',
  'Berlin',
  'Toronto',
  'Sao Paulo',
  'Mumbai',
  'Cairo',
  'Johannesburg',
  'Mexico City',
  'Chicago',
  'Seoul',
  'Madrid',
]

function rnd<T>(arr: T[]): T {
  return arr[(Math.random() * arr.length) | 0]
}

function rndInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Public IPv4 blocks to sample from (rough, non-exhaustive). Each is [start, end] inclusive.
// Why: Avoid private/reserved ranges so logs look realistic.
const publicV4Blocks: Array<[number, number]> = [
  // 1.0.0.0/8 to 126.0.0.0/8 (exclude 10.0.0.0/8)
  [toV4Int('1.0.0.0'), toV4Int('9.255.255.255')],
  [toV4Int('11.0.0.0'), toV4Int('126.255.255.255')],
  // 128.0.0.0/3 (skip 127.0.0.0/8 loopback)
  [toV4Int('128.0.0.0'), toV4Int('169.253.255.255')], // up to before 169.254/16 (link-local)
  [toV4Int('169.255.0.0'), toV4Int('172.15.255.255')], // before 172.16/12 (private)
  [toV4Int('172.32.0.0'), toV4Int('191.255.255.255')], // skip 172.16/12 & 192.0.0.0/24 reserved handled below
  [toV4Int('192.0.2.0'), toV4Int('192.88.98.255')], // skip 192.0.0.0/24 special, 192.0.2.0/24 TEST-NET-1 ok
  [toV4Int('192.88.100.0'), toV4Int('192.167.255.255')], // skip 192.88.99.0/24 6to4 anycast
  [toV4Int('192.169.0.0'), toV4Int('198.17.255.255')], // skip 192.168/16 private
  [toV4Int('198.20.0.0'), toV4Int('198.51.99.255')], // skip 198.18/15 benchmarking, allow before TEST-NET-2
  [toV4Int('198.51.101.0'), toV4Int('203.0.112.255')], // skip 198.51.100/24 TEST-NET-2, 203.0.113/24 handled below
  [toV4Int('203.0.114.0'), toV4Int('223.255.255.255')], // skip 203.0.113/24 TEST-NET-3
]

function toV4Int(ip: string): number {
  const [a, b, c, d] = ip.split('.').map(Number)
  return ((a << 24) >>> 0) + (b << 16) + (c << 8) + d
}

function fromV4Int(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

function randomIpv4(): string {
  const [start, end] = rnd(publicV4Blocks)
  const n = rndInt(start, end)
  return fromV4Int(n >>> 0)
}

// Generate a global unicast IPv6 in 2000::/3 and format in a compact form.
// Generate IPv6 from known global prefixes that typically geolocate.
const knownV6Prefixes = [
  // Google
  '2001:4860', // /32
  '2607:f8b0', // /32 (US)
  '2a00:1450', // /32 (EU)
  '2404:6800', // /32 (APAC)
  // Cloudflare
  '2606:4700',
  // Meta
  '2a03:2880',
  // Akamai
  '2a02:26f0',
  // AWS (various)
  '2a05:d014',
]

function randomIpv6(): string {
  const prefix = rnd(knownV6Prefixes)
  const fixed = prefix.split(':').map(h => parseInt(h, 16))
  const parts = new Uint16Array(8)
  for (let i = 0; i < fixed.length; i++) parts[i] = fixed[i]
  for (let i = fixed.length; i < 8; i++) parts[i] = (Math.random() * 0x10000) | 0
  return compressIpv6(parts)
}

function compressIpv6(parts: Uint16Array): string {
  let bestStart = -1
  let bestLen = 0
  let curStart = -1
  let curLen = 0

  for (let i = 0; i < 8; i++) {
    if (parts[i] === 0) {
      if (curStart === -1) curStart = i
      curLen++
    } else {
      if (curLen > bestLen) {
        bestStart = curStart
        bestLen = curLen
      }
      curStart = -1
      curLen = 0
    }
  }
  if (curLen > bestLen) {
    bestStart = curStart
    bestLen = curLen
  }

  const hextets: string[] = []
  let i = 0
  while (i < 8) {
    if (bestLen >= 2 && i === bestStart) {
      hextets.push('')
      i += bestLen
      if (i >= 8) hextets.push('')
      continue
    }
    hextets.push(parts[i].toString(16))
    i++
  }
  return hextets.join(':').replace(/^:|:$/g, m => (m.length ? ':' : ''))
}

function randomIp(): string {
  return Math.random() < 0.7 ? randomIpv4() : randomIpv6()
}

function formatDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][d.getUTCMonth()]
  const year = d.getUTCFullYear()
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${day}/${month}/${year}:${hh}:${mm}:${ss} +0000`
}

function buildPath(): string {
  const base = rnd(paths)
  const city = encodeURIComponent(rnd(cities))
  if (base.includes('?')) return `${base}&city=${city}`
  if (base !== '/' && Math.random() < 0.3)
    return `${base}/${city.toLowerCase().replace(/%20/g, '-')}`
  return `${base}?city=${city}`
}

function buildLogLine(now: Date): string {
  const ip = randomIp()
  const ident = '-'
  const user = '-'
  const time = formatDate(now)
  const method = rnd(methods)
  const path = buildPath()
  const protocol = 'HTTP/1.1'
  const status = rnd(statuses)
  const bytes = rndInt(200, 200000)
  const ref = rnd(referrers)
  const ua = rnd(userAgents)
  const request = `${method} ${path} ${protocol}`
  return `${ip} ${ident} ${user} [${time}] "${request}" ${status} ${bytes} "${ref}" "${ua}"`
}

async function main() {
  const args = new Map<string, string>()
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.includes('=') ? a.split('=') : [a, 'true']
    args.set(k.replace(/^--?/, ''), v)
  }

  const count = Number(args.get('count') ?? process.env.COUNT ?? 100)
  const rateArg = args.get('rate') ?? process.env.RATE // examples: 10/s, 100/m
  let intervalMs = 0
  if (rateArg) {
    const m = String(rateArg).match(/^(\d+)(?:\/(s|m|h))?$/)
    if (m) {
      const n = Number(m[1])
      const unit = m[2] ?? 's'
      const perMs = unit === 's' ? 1000 : unit === 'm' ? 60000 : 3600000
      intervalMs = Math.floor(perMs / Math.max(1, n))
    }
  }

  const start = Date.now()
  for (let i = 0; i < count; i++) {
    const line = buildLogLine(new Date(start + i * (intervalMs || rndInt(0, 250))))
    process.stdout.write(line + '\n')
    if (intervalMs) await delay(intervalMs)
  }
}

if (import.meta.main) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
