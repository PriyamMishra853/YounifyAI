import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb)

/* ------------------------------------------------------------------- ids */

/** RFC 9562 UUIDv7: 48-bit millisecond timestamp, then random. Sorts by creation time. */
export function uuidv7() {
  const b = randomBytes(16)
  let ts = Date.now()
  for (let i = 5; i >= 0; i--) {
    b[i] = ts % 256
    ts = Math.floor(ts / 256)
  }
  b[6] = (b[6] & 0x0f) | 0x70
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/* --------------------------------------------------------------- secrets */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split('$')
  if (alg !== 'scrypt') return false
  const expected = Buffer.from(hash, 'base64url')
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, { N: +N, r: +r, p: +p })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export const newToken = () => randomBytes(32).toString('base64url')
export const sha256 = (s) => createHash('sha256').update(s).digest('hex')

/* ------------------------------------------------------------------ time */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** The current quota day, which starts at midnight India time. */
export function istDay(now = new Date()) {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  const start = new Date(shifted.getTime() - IST_OFFSET_MS)
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}

export const iso = (d) => (d == null ? null : d instanceof Date ? d.toISOString() : new Date(d).toISOString())

/* ----------------------------------------------------------------- misc */

export function safeFileName(name = 'file') {
  const base = String(name).split(/[\\/]/).pop().normalize('NFKD').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '_')
  return (base || 'file').slice(-120)
}

export const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '')
