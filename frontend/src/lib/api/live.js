// HTTP implementation of the API contract (docs/04-api-reference.md).
// Same function names and return shapes as mock.js. Requests go to /api on the
// same origin (the Vite dev proxy forwards them to the Express server).
import { ApiError } from './errors'

async function request(method, path, { body, form, query, raw = false } = {}) {
  const url = new URL(`/api${path}`, window.location.origin)
  for (const [k, v] of Object.entries(query || {})) if (v != null && v !== '') url.searchParams.set(k, v)
  const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } }
  if (form) init.body = form
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError('Cannot reach the YounifyAI server. Check that it is running, then try again.', { status: 0, code: 'network' })
  }
  if (res.ok && raw) return res
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(data?.error?.message || `The request failed (${res.status}).`, { status: res.status, code: data?.error?.code || 'error', fields: data?.error?.fields })
  }
  return data
}

const get = (path, query) => request('GET', path, { query })
const send = (method) => (path, body) => request(method, path, { body })
const post = send('POST')
const patch = send('PATCH')
const put = send('PUT')
const del = (path) => request('DELETE', path)

/* ------------------------------------------------------------------ auth */
export const signup = (input) => post('/auth/signup', input)
export const login = (input) => post('/auth/login', input)
export const logout = () => post('/auth/logout')
export const me = () => get('/auth/me')

/* ------------------------------------------------------------- account */
export const updateProfile = (input) => patch('/me', input)
export const updateWorkspace = (input) => patch('/workspace', input)
export const getUsage = () => get('/workspace/usage')
export const changePlan = (plan) => put('/workspace/plan', { plan })
export const listWorkspaces = () => get('/workspaces')
export const switchWorkspace = (workspaceId) => post('/workspaces/switch', { workspaceId })

/* ------------------------------------------------------------- members */
export const listMembers = () => get('/workspace/members')
export const inviteMember = (input) => post('/workspace/members', input)
export const updateMemberRole = (id, role) => patch(`/workspace/members/${id}`, { role })
export const removeMember = (id) => del(`/workspace/members/${id}`)

/* ----------------------------------------------------------- templates */
export const listTemplates = () => get('/templates')
export const createTemplate = (input) => post('/templates', input)
export const updateTemplate = (id, input) => patch(`/templates/${id}`, input)
export const deleteTemplate = (id) => del(`/templates/${id}`)

/* ----------------------------------------------------------- knowledge */
export const listSources = () => get('/sources')
export function addSource({ title, templateId = null, text = '', file = null }) {
  const form = new FormData()
  form.set('title', title || '')
  if (templateId) form.set('templateId', templateId)
  if (file) form.set('file', file)
  else form.set('text', text)
  return request('POST', '/sources', { form })
}
export const deleteSource = (id) => del(`/sources/${id}`)

/* ---------------------------------------------------------------- jobs */
export function createJob({ templateId, inputs = [], instructions = '' }) {
  const form = new FormData()
  form.set('templateId', templateId)
  form.set('instructions', instructions)
  form.set('texts', JSON.stringify(inputs.filter((i) => i.kind === 'text' && i.text != null).map((i) => ({ name: i.name, text: i.text }))))
  form.set('links', JSON.stringify(inputs.filter((i) => i.url).map((i) => ({ url: i.url, title: i.title }))))
  for (const i of inputs) if (i.file) form.append('files', i.file, i.file.name)
  return request('POST', '/jobs', { form })
}
export const previewLink = (url) => post('/links/preview', { url })
export const getJob = (id) => get(`/jobs/${id}`)
export const listJobs = ({ limit = 10 } = {}) => get('/jobs', { limit })

/**
 * Calls onUpdate(job) on every change until the job finishes. Uses server-sent
 * events, and falls back to polling if the stream cannot be opened.
 * Returns an unsubscribe function.
 */
export function subscribeJob(id, onUpdate, onError) {
  let stopped = false
  let es = null
  let timer = null
  const finished = (job) => job.status === 'succeeded' || job.status === 'failed'

  const poll = async () => {
    if (stopped) return
    try {
      const job = await getJob(id)
      onUpdate(job)
      if (finished(job)) return
    } catch (e) {
      onError?.(e)
      return
    }
    timer = setTimeout(poll, 1000)
  }

  if (typeof EventSource === 'undefined') poll()
  else {
    es = new EventSource(`/api/jobs/${id}/events`, { withCredentials: true })
    let got = false
    es.addEventListener('job', (e) => {
      got = true
      onUpdate(JSON.parse(e.data))
    })
    es.addEventListener('end', () => es.close())
    es.onerror = () => {
      es.close()
      if (!stopped && !got) poll() // stream refused (e.g. 404): polling reports the real error
      else if (!stopped) timer = setTimeout(poll, 500) // dropped mid-way: catch up by polling
    }
  }
  return () => {
    stopped = true
    es?.close()
    clearTimeout(timer)
  }
}

/* ----------------------------------------------------------- documents */
export const listDocuments = (filters = {}) => get('/documents', filters)
export const getDocument = (id) => get(`/documents/${id}`)
export const updateDocument = (id, input) => patch(`/documents/${id}`, input)
export const approveDocument = (id) => post(`/documents/${id}/approve`)
export const listVersions = (id) => get(`/documents/${id}/versions`)
export const restoreVersion = (id, versionId) => post(`/documents/${id}/versions/${versionId}/restore`)
export const listAudit = ({ documentId } = {}) => get('/audit', { documentId })
export const deleteDocument = (id) => del(`/documents/${id}`)

/** Resolves to { blob, filename }. */
export async function exportDocument(id, format) {
  const res = await request('GET', `/documents/${id}/export`, { query: { format }, raw: true })
  const cd = res.headers.get('content-disposition') || ''
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i)
  const plain = cd.match(/filename="([^"]+)"/i)
  const filename = star ? decodeURIComponent(star[1]) : plain ? plain[1] : `document.${format}`
  return { blob: await res.blob(), filename }
}

/* ------------------------------------------------------------ overview */
export const getOverview = () => get('/overview')
