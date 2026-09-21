// Picks the API implementation:
//   live — the Express server at /api (real pipeline, database, exports)
//   mock — everything in this browser's localStorage (no server needed)
// VITE_API_MODE=live|mock forces one. Otherwise detectApi() probes /api/health
// once at startup and uses the server when it answers.
import * as mock from './mock'
import * as live from './live'

const forced = import.meta.env.VITE_API_MODE
export let API_MODE = forced === 'live' || forced === 'mock' ? forced : 'mock'

export const api = new Proxy({}, { get: (_, key) => (API_MODE === 'live' ? live : mock)[key] })

export async function detectApi() {
  if (forced === 'live' || forced === 'mock') return API_MODE
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal })
    clearTimeout(t)
    if (res.ok && (await res.json())?.ok) API_MODE = 'live'
  } catch {
    // no server: stay on the in-browser API
  }
  return API_MODE
}

export { ApiError } from './errors'
