// Picks the API implementation. `mock` runs entirely in the browser (localStorage);
// `live` talks to the Express server through the Vite proxy at /api.
import * as mock from './mock'

export const API_MODE = import.meta.env.VITE_API_MODE || 'mock'
export const api = mock
export { ApiError } from './errors'
