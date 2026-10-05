// In-browser implementation of the API contract (docs/04-api-reference.md).
// Everything lives in localStorage so the whole product can be clicked through
// without a server. Signatures and return shapes match live.js exactly.

import {
  SYSTEM_TEMPLATES, PLANS, PIPELINE_STAGES, templateById, planById, modalityOf,
  offlineStructure, normalizeContent, validateDocument, computeDerived, toMarkdown,
} from '@younifyai/shared'
import { ApiError } from './errors'
import { sampleDocuments, SAMPLE_PRICE_LIST } from '@younifyai/shared'

const KEY = 'younify.mock.v1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const latency = () => sleep(120 + Math.random() * 180)
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
const nowIso = () => new Date().toISOString()
const localDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

const EMPTY = { users: [], sessionUserId: null, workspaces: [], members: [], templates: [], jobs: [], documents: [], versions: [], audit: [], sources: [] }

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : structuredClone(EMPTY)
  } catch {
    return structuredClone(EMPTY)
  }
}
function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* storage full or blocked: keep in memory */ }
}

let db = load()
const commit = () => save(db)

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* ---------------------------------------------------------------- context */

function ctx() {
  const user = db.users.find((u) => u.id === db.sessionUserId)
  if (!user) throw new ApiError('Sign in to continue.', { status: 401, code: 'unauthenticated' })
  const member = db.members.find((m) => m.userId === user.id && m.status === 'active')
  const workspace = db.workspaces.find((w) => w.id === member?.workspaceId)
  return { user, member, workspace, role: member.role }
}

function need(role, allowed) {
  if (!allowed.includes(role)) throw new ApiError('Your role does not allow this.', { status: 403, code: 'forbidden' })
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt })
const actor = (u) => (u ? { id: u.id, name: u.name } : null)

function audit(workspaceId, { documentId = null, action, user = null, detail = '' }) {
  db.audit.push({ id: uid('aud'), workspaceId, documentId, action, actor: actor(user), detail, at: nowIso() })
}

function allTemplates(workspaceId) {
  return [...SYSTEM_TEMPLATES.map((t) => ({ ...t, system: true })), ...db.templates.filter((t) => t.workspaceId === workspaceId)]
}
function findTemplate(workspaceId, id) {
  const t = allTemplates(workspaceId).find((x) => x.id === id)
  if (!t) throw new ApiError('That template no longer exists.', { status: 404, code: 'not_found' })
  return t
}

function withIssues(doc, workspaceId) {
  const t = allTemplates(workspaceId).find((x) => x.id === doc.templateId)
  return { ...doc, templateName: t?.name || 'Deleted template', issues: t ? validateDocument(t, doc.content).issues : [] }
}

/* ------------------------------------------------------------------ usage */

function usageFor(workspace) {
  const plan = PLANS.find((p) => p.id === workspace.plan) || PLANS[0]
  const today = localDay()
  const used = db.jobs.filter((j) => j.workspaceId === workspace.id && localDay(new Date(j.createdAt)) === today).length
  const resets = new Date()
  resets.setHours(24, 0, 0, 0)
  return { plan: plan.id, used, limit: plan.tasksPerDay, unlimited: !!plan.unlimited, resetsAt: resets.toISOString() }
}

/* ------------------------------------------------------------------- auth */

function seedWorkspace(user, workspace) {
  for (const s of sampleDocuments()) {
    const t = templateById(s.templateId)
    const id = uid('doc')
    const at = nowIso()
    db.documents.push({
      id, workspaceId: workspace.id, templateId: s.templateId, title: s.content.title || `${t.name} ${s.content.bill_no || ''}`.trim(),
      status: s.status, content: s.content, version: 1, jobId: null, inputs: s.inputs, sample: true,
      createdAt: at, updatedAt: at, approvedAt: s.status === 'approved' ? at : null, approvedBy: s.status === 'approved' ? actor(user) : null,
      createdBy: actor(user),
    })
    db.versions.push({ id: uid('ver'), documentId: id, version: 1, title: s.content.title || t.name, content: s.content, createdAt: at, createdBy: null, note: 'Generated' })
    audit(workspace.id, { documentId: id, action: 'document.generated', detail: `${t.name} sample` })
    if (s.status === 'approved') audit(workspace.id, { documentId: id, action: 'document.approved', user })
  }
  db.sources.push({
    id: uid('src'), workspaceId: workspace.id, title: 'Store price list', templateId: 'voice_bill', kind: 'text',
    text: SAMPLE_PRICE_LIST, chars: SAMPLE_PRICE_LIST.length, createdAt: nowIso(),
  })
}

export async function signup({ name, email, password }) {
  await latency()
  const fields = {}
  if (!name?.trim()) fields.name = 'Enter your name.'
  if (!/^\S+@\S+\.\S+$/.test(email || '')) fields.email = 'Enter a valid email address.'
  if ((password || '').length < 8) fields.password = 'Use at least 8 characters.'
  if (Object.keys(fields).length) throw new ApiError('Check the highlighted fields.', { status: 422, code: 'invalid', fields })
  const normalized = email.trim().toLowerCase()
  if (db.users.some((u) => u.email === normalized)) {
    throw new ApiError('An account with this email already exists. Sign in instead.', { status: 409, code: 'email_taken', fields: { email: 'Already registered.' } })
  }
  const user = { id: uid('usr'), name: name.trim(), email: normalized, passwordHash: await sha256(password), createdAt: nowIso() }
  const workspace = { id: uid('wsp'), name: `${user.name.split(' ')[0]}’s workspace`, plan: 'free', createdAt: nowIso() }
  db.users.push(user)
  db.workspaces.push(workspace)
  db.members.push({ id: uid('mem'), workspaceId: workspace.id, userId: user.id, name: user.name, email: user.email, role: 'owner', status: 'active', joinedAt: nowIso() })
  seedWorkspace(user, workspace)
  db.sessionUserId = user.id
  commit()
  return me()
}

export async function login({ email, password }) {
  await latency()
  const user = db.users.find((u) => u.email === String(email || '').trim().toLowerCase())
  if (!user || user.passwordHash !== (await sha256(password || ''))) {
    throw new ApiError('That email and password do not match an account.', { status: 401, code: 'bad_credentials' })
  }
  db.sessionUserId = user.id
  commit()
  return me()
}

export async function logout() {
  db.sessionUserId = null
  commit()
}

export async function me() {
  const user = db.users.find((u) => u.id === db.sessionUserId)
  if (!user) return null
  const { workspace, role } = ctx()
  return { user: publicUser(user), workspace, role }
}

/* ---------------------------------------------------------------- account */

export async function updateProfile({ name }) {
  await latency()
  const { user } = ctx()
  if (!name?.trim()) throw new ApiError('Enter your name.', { status: 422, code: 'invalid', fields: { name: 'Required.' } })
  user.name = name.trim()
  db.members.filter((m) => m.userId === user.id).forEach((m) => { m.name = user.name })
  commit()
  return publicUser(user)
}

export async function updateWorkspace({ name }) {
  await latency()
  const { workspace, role } = ctx()
  need(role, ['owner'])
  if (!name?.trim()) throw new ApiError('Enter a workspace name.', { status: 422, code: 'invalid' })
  workspace.name = name.trim()
  commit()
  return workspace
}

export async function listWorkspaces() {
  await latency()
  const { user } = ctx()
  return db.members.filter((m) => m.userId === user.id && m.status === 'active')
    .map((m) => ({ ...db.workspaces.find((w) => w.id === m.workspaceId), role: m.role }))
}

export async function switchWorkspace() {
  throw new ApiError('Switching workspaces needs the API server.', { status: 501, code: 'needs_server' })
}

export async function getUsage() {
  await latency()
  return usageFor(ctx().workspace)
}

export async function changePlan(planId) {
  await latency()
  const { workspace, role, user } = ctx()
  need(role, ['owner'])
  if (!PLANS.some((p) => p.id === planId)) throw new ApiError('Unknown plan.', { status: 422, code: 'invalid' })
  workspace.plan = planId
  audit(workspace.id, { action: 'workspace.plan_changed', user, detail: planId })
  commit()
  return usageFor(workspace)
}

/* ---------------------------------------------------------------- members */

export async function listMembers() {
  await latency()
  const { workspace } = ctx()
  return db.members.filter((m) => m.workspaceId === workspace.id)
}

export async function inviteMember({ email, role }) {
  await latency()
  const { workspace, role: myRole, user } = ctx()
  need(myRole, ['owner'])
  if (workspace.plan !== 'pro') throw new ApiError('Workspace members are part of the Pro plan.', { status: 402, code: 'plan_required' })
  const normalized = String(email || '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new ApiError('Enter a valid email address.', { status: 422, code: 'invalid', fields: { email: 'Invalid email.' } })
  if (!['editor', 'viewer', 'owner'].includes(role)) throw new ApiError('Pick a role.', { status: 422, code: 'invalid' })
  if (db.members.some((m) => m.workspaceId === workspace.id && m.email === normalized)) {
    throw new ApiError('That person is already in this workspace.', { status: 409, code: 'exists' })
  }
  const m = { id: uid('mem'), workspaceId: workspace.id, userId: null, name: normalized.split('@')[0], email: normalized, role, status: 'invited', joinedAt: null }
  db.members.push(m)
  audit(workspace.id, { action: 'member.invited', user, detail: `${normalized} as ${role}` })
  commit()
  return m
}

export async function updateMemberRole(memberId, role) {
  await latency()
  const { workspace, role: myRole, user } = ctx()
  need(myRole, ['owner'])
  const m = db.members.find((x) => x.id === memberId && x.workspaceId === workspace.id)
  if (!m) throw new ApiError('Member not found.', { status: 404, code: 'not_found' })
  const owners = db.members.filter((x) => x.workspaceId === workspace.id && x.role === 'owner' && x.status === 'active')
  if (m.role === 'owner' && role !== 'owner' && owners.length <= 1) throw new ApiError('A workspace needs at least one owner.', { status: 409, code: 'last_owner' })
  m.role = role
  audit(workspace.id, { action: 'member.role_changed', user, detail: `${m.email} → ${role}` })
  commit()
  return m
}

export async function removeMember(memberId) {
  await latency()
  const { workspace, role: myRole, user } = ctx()
  need(myRole, ['owner'])
  const m = db.members.find((x) => x.id === memberId && x.workspaceId === workspace.id)
  if (!m) return
  if (m.userId === user.id) throw new ApiError('You cannot remove yourself.', { status: 409, code: 'self' })
  db.members = db.members.filter((x) => x !== m)
  audit(workspace.id, { action: 'member.removed', user, detail: m.email })
  commit()
}

/* -------------------------------------------------------------- templates */

export async function listTemplates() {
  await latency()
  return allTemplates(ctx().workspace.id)
}

function checkTemplate(input) {
  const fields = {}
  if (!input.name?.trim()) fields.name = 'Name the template.'
  if (!Array.isArray(input.fields) || !input.fields.length) fields.fields = 'Add at least one field.'
  const keys = new Set()
  for (const f of input.fields || []) {
    if (!f.key || !/^[a-z][a-z0-9_]*$/.test(f.key)) fields.fields = 'Field keys use lowercase letters, digits and underscores.'
    if (keys.has(f.key)) fields.fields = `Two fields share the key “${f.key}”.`
    keys.add(f.key)
  }
  if (Object.keys(fields).length) throw new ApiError('Check the template.', { status: 422, code: 'invalid', fields })
}

export async function createTemplate(input) {
  await latency()
  const { workspace, role, user } = ctx()
  need(role, ['owner', 'editor'])
  if (workspace.plan !== 'pro') throw new ApiError('Custom templates are part of the Pro plan.', { status: 402, code: 'plan_required' })
  checkTemplate(input)
  const t = {
    id: uid('tpl'), workspaceId: workspace.id, system: false, stage: 'custom', vertical: input.vertical || 'Custom',
    name: input.name.trim(), description: input.description || '', flow: input.flow || '', instructions: input.instructions || '',
    accepts: input.accepts?.length ? input.accepts : ['voice', 'video', 'image', 'text', 'docs'], fields: input.fields,
    createdAt: nowIso(),
  }
  db.templates.push(t)
  audit(workspace.id, { action: 'template.created', user, detail: t.name })
  commit()
  return t
}

export async function updateTemplate(id, input) {
  await latency()
  const { workspace, role, user } = ctx()
  need(role, ['owner', 'editor'])
  const t = db.templates.find((x) => x.id === id && x.workspaceId === workspace.id)
  if (!t) throw new ApiError('Built-in templates cannot be edited. Duplicate it instead.', { status: 403, code: 'forbidden' })
  checkTemplate({ ...t, ...input })
  Object.assign(t, input, { id: t.id, workspaceId: t.workspaceId, system: false })
  audit(workspace.id, { action: 'template.updated', user, detail: t.name })
  commit()
  return t
}

export async function deleteTemplate(id) {
  await latency()
  const { workspace, role, user } = ctx()
  need(role, ['owner', 'editor'])
  const t = db.templates.find((x) => x.id === id && x.workspaceId === workspace.id)
  if (!t) return
  db.templates = db.templates.filter((x) => x !== t)
  audit(workspace.id, { action: 'template.deleted', user, detail: t.name })
  commit()
}

/* ------------------------------------------------------------- knowledge */

export async function listSources() {
  await latency()
  const { workspace } = ctx()
  return db.sources.filter((s) => s.workspaceId === workspace.id).map(({ text, ...s }) => ({ ...s, preview: text.slice(0, 180) }))
}

export async function addSource({ title, templateId = null, text = '', file = null }) {
  await latency()
  const { workspace, role, user } = ctx()
  need(role, ['owner', 'editor'])
  const limit = planById(workspace.plan).limits.sources
  if (limit != null && db.sources.filter((s) => s.workspaceId === workspace.id).length >= limit) {
    throw new ApiError(`Your plan allows ${limit} reference sources. Delete one or upgrade.`, { status: 402, code: 'plan_limit' })
  }
  let body = text
  if (file) {
    if (!/^text\/|\.(txt|md|csv)$/i.test(file.type || file.name)) {
      throw new ApiError('In this preview, reference files must be .txt, .md or .csv. PDF and DOCX need the API server.', { status: 415, code: 'unsupported' })
    }
    body = await file.text()
  }
  if (!title?.trim()) throw new ApiError('Name this source.', { status: 422, code: 'invalid', fields: { title: 'Required.' } })
  if (!body.trim()) throw new ApiError('The source is empty.', { status: 422, code: 'invalid', fields: { text: 'Paste some text or choose a file.' } })
  const s = { id: uid('src'), workspaceId: workspace.id, title: title.trim(), templateId, kind: file ? 'file' : 'text', text: body, chars: body.length, createdAt: nowIso() }
  db.sources.push(s)
  audit(workspace.id, { action: 'source.added', user, detail: s.title })
  commit()
  const { text: _t, ...rest } = s
  return { ...rest, preview: body.slice(0, 180) }
}

export async function deleteSource(id) {
  await latency()
  const { workspace, role, user } = ctx()
  need(role, ['owner', 'editor'])
  const s = db.sources.find((x) => x.id === id && x.workspaceId === workspace.id)
  if (!s) return
  db.sources = db.sources.filter((x) => x !== s)
  audit(workspace.id, { action: 'source.deleted', user, detail: s.title })
  commit()
}

/* ------------------------------------------------------------------- jobs */

const STAGE_MS = { capture: 700, extract: 2200, normalize: 1100, retrieve: 1300, generate: 2600, validate: 1000, deliver: 700 }

function stageLog(key, job, template, sources) {
  const kinds = [...new Set(job.inputs.map((i) => i.kind))]
  switch (key) {
    case 'capture': return [`Received ${job.inputs.length} input${job.inputs.length === 1 ? '' : 's'}: ${kinds.join(', ')}`]
    case 'extract': return job.inputs.map((i) => ({
      voice: `${i.name}: speech to text`, video: `${i.name}: audio track + key frames`, image: `${i.name}: OCR + image description`,
      text: `${i.name}: ${i.chars ?? 0} characters`, docs: `${i.name}: parsed document text`,
    }[i.kind]))
    case 'normalize': return ['Cleaned and segmented text', `Detected intent: ${template.name}`]
    case 'retrieve': return sources.length ? sources.map((s) => `Matched reference: ${s.title}`) : ['No reference material for this template']
    case 'generate': return [`Filled ${template.fields.length} fields from the ${template.name} schema`, 'Preview mode: offline structuring (no AI provider)']
    case 'validate': return ['Checked required fields and arithmetic']
    case 'deliver': return ['Draft saved for review']
    default: return []
  }
}

function materialize(job) {
  if (job.status === 'succeeded' || job.status === 'failed') return job
  const t0 = new Date(job.createdAt).getTime()
  const elapsed = Date.now() - t0
  let acc = 0
  const template = allTemplates(job.workspaceId).find((t) => t.id === job.templateId)
  const sources = db.sources.filter((s) => s.workspaceId === job.workspaceId && (!s.templateId || s.templateId === job.templateId))
  job.stages = PIPELINE_STAGES.map(({ key }) => {
    const start = acc
    acc += STAGE_MS[key]
    const status = elapsed >= acc ? 'done' : elapsed >= start ? 'running' : 'pending'
    return {
      key, status,
      startedAt: status !== 'pending' ? new Date(t0 + start).toISOString() : null,
      finishedAt: status === 'done' ? new Date(t0 + acc).toISOString() : null,
      log: status === 'pending' ? [] : stageLog(key, job, template, sources),
    }
  })
  job.status = elapsed >= acc ? 'succeeded' : 'running'
  if (job.status === 'succeeded' && !job.documentId) {
    const text = [job.instructions, ...job.inputs.map((i) => i.text || '')].filter(Boolean).join('\n')
    let content
    if (text.trim()) content = offlineStructure(template, { text, sources: sources.map((s) => s.text) })
    else {
      const sample = sampleDocuments().find((s) => s.templateId === template.id)
      content = sample ? computeDerived(template, normalizeContent(template, sample.content)) : offlineStructure(template, { text: job.inputs.map((i) => i.name).join('. ') })
    }
    const id = uid('doc')
    const at = new Date(t0 + acc).toISOString()
    const user = db.users.find((u) => u.id === job.createdBy)
    db.documents.push({
      id, workspaceId: job.workspaceId, templateId: template.id,
      title: content.title || `${template.name}${content.bill_no ? ` #${content.bill_no}` : ''}`,
      status: 'draft', content, version: 1, jobId: job.id, inputs: job.inputs, sample: false,
      createdAt: at, updatedAt: at, approvedAt: null, approvedBy: null, createdBy: actor(user),
    })
    db.versions.push({ id: uid('ver'), documentId: id, version: 1, title: content.title || template.name, content, createdAt: at, createdBy: null, note: 'Generated' })
    audit(job.workspaceId, { documentId: id, action: 'document.generated', detail: `${template.name} from ${job.inputs.length} input(s)` })
    job.documentId = id
    job.finishedAt = at
  }
  commit()
  return job
}

export async function createJob({ templateId, inputs = [], instructions = '' }) {
  await latency()
  const { workspace, role, user } = ctx()
  need(role, ['owner', 'editor'])
  const template = findTemplate(workspace.id, templateId)
  const usage = usageFor(workspace)
  if (usage.used >= usage.limit) {
    throw new ApiError(`You have used all ${usage.limit} documents for today on the ${usage.plan} plan. Upgrade or wait until midnight.`, { status: 429, code: 'quota_exceeded' })
  }
  if (!inputs.length && !instructions.trim()) throw new ApiError('Add at least one input: a file, a recording or some text.', { status: 422, code: 'invalid' })
  if (inputs.some((i) => i.url)) throw new ApiError('YouTube links need the API server. Start it with `npm run dev` and reload.', { status: 501, code: 'needs_server' })
  const stored = []
  for (const input of inputs) {
    if (input.kind === 'text') stored.push({ id: uid('inp'), kind: 'text', name: input.name || 'pasted_text.txt', size: input.text.length, chars: input.text.length, text: input.text })
    else {
      const file = input.file
      const kind = modalityOf(file)
      const isText = /^text\//.test(file.type) || /\.(txt|md|csv)$/i.test(file.name)
      const text = isText ? await file.text() : ''
      stored.push({ id: uid('inp'), kind, name: file.name, size: file.size, chars: text.length || undefined, text: text || undefined })
    }
  }
  const job = {
    id: uid('job'), workspaceId: workspace.id, templateId: template.id, templateName: template.name, status: 'queued',
    inputs: stored, instructions, createdAt: nowIso(), finishedAt: null, documentId: null, stages: [], error: null, createdBy: user.id,
  }
  db.jobs.push(job)
  audit(workspace.id, { action: 'job.created', user, detail: `${template.name}, ${stored.length} input(s)` })
  commit()
  return publicJob(materialize(job))
}

const publicJob = ({ inputs, ...j }) => ({ ...j, inputs: inputs.map(({ text, ...i }) => i) })

export async function previewLink() {
  await latency()
  throw new ApiError('YouTube links need the API server. Start it with `npm run dev` and reload.', { status: 501, code: 'needs_server' })
}

export async function getJob(id) {
  await sleep(60)
  const { workspace } = ctx()
  const job = db.jobs.find((j) => j.id === id && j.workspaceId === workspace.id)
  if (!job) throw new ApiError('This job does not exist in your workspace.', { status: 404, code: 'not_found' })
  return publicJob(materialize(job))
}

export async function listJobs({ limit = 10 } = {}) {
  await latency()
  const { workspace } = ctx()
  return db.jobs.filter((j) => j.workspaceId === workspace.id).map(materialize).map(publicJob)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit)
}

/** Calls `onUpdate(job)` until the job finishes. Returns an unsubscribe function. */
export function subscribeJob(id, onUpdate, onError) {
  let stopped = false
  const tick = async () => {
    if (stopped) return
    try {
      const job = await getJob(id)
      onUpdate(job)
      if (job.status === 'succeeded' || job.status === 'failed') return
    } catch (e) {
      onError?.(e)
      return
    }
    setTimeout(tick, 350)
  }
  tick()
  return () => { stopped = true }
}

/* -------------------------------------------------------------- documents */

function findDoc(id) {
  const { workspace } = ctx()
  const doc = db.documents.find((d) => d.id === id && d.workspaceId === workspace.id)
  if (!doc) throw new ApiError('This document does not exist in your workspace.', { status: 404, code: 'not_found' })
  return doc
}

export async function listDocuments({ q = '', templateId = '', status = '', sort = 'updated' } = {}) {
  await latency()
  const { workspace } = ctx()
  const needle = q.trim().toLowerCase()
  return db.documents
    .filter((d) => d.workspaceId === workspace.id)
    .filter((d) => !templateId || d.templateId === templateId)
    .filter((d) => !status || d.status === status)
    .filter((d) => !needle || d.title.toLowerCase().includes(needle) || JSON.stringify(d.content).toLowerCase().includes(needle))
    .map((d) => withIssues(d, workspace.id))
    .map(({ content, ...d }) => ({ ...d, excerpt: String(content.summary || content.entry || content.notes || '').slice(0, 140) }))
    .sort((a, b) => (sort === 'created' ? b.createdAt.localeCompare(a.createdAt) : sort === 'title' ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)))
}

export async function getDocument(id) {
  await latency()
  const { workspace } = ctx()
  const doc = findDoc(id)
  return { ...withIssues(doc, workspace.id), template: allTemplates(workspace.id).find((t) => t.id === doc.templateId) || null }
}

export async function updateDocument(id, { title, content, expectedVersion }) {
  await latency()
  const { workspace, role, user } = ctx()
  need(role, ['owner', 'editor'])
  const doc = findDoc(id)
  if (expectedVersion != null && expectedVersion !== doc.version) {
    throw new ApiError('Someone else saved this document since you opened it. Reload to see their changes.', { status: 409, code: 'version_conflict' })
  }
  const t = findTemplate(workspace.id, doc.templateId)
  const next = normalizeContent(t, content ?? doc.content)
  doc.content = next
  if (title != null) doc.title = title.trim() || doc.title
  const wasApproved = doc.status === 'approved'
  doc.status = 'draft'
  doc.approvedAt = null
  doc.approvedBy = null
  doc.version += 1
  doc.updatedAt = nowIso()
  db.versions.push({ id: uid('ver'), documentId: id, version: doc.version, title: doc.title, content: next, createdAt: doc.updatedAt, createdBy: actor(user), note: 'Edited' })
  audit(workspace.id, { documentId: id, action: 'document.edited', user, detail: wasApproved ? `v${doc.version} · approval withdrawn` : `v${doc.version}` })
  commit()
  return withIssues(doc, workspace.id)
}

export async function approveDocument(id) {
  await latency()
  const { workspace, role, user } = ctx()
  need(role, ['owner', 'editor'])
  const doc = findDoc(id)
  const t = findTemplate(workspace.id, doc.templateId)
  const { ok, issues } = validateDocument(t, doc.content)
  if (!ok) throw new ApiError(`Fix ${issues.filter((i) => i.level === 'error').length} problem(s) before approving.`, { status: 422, code: 'invalid_document' })
  doc.status = 'approved'
  doc.approvedAt = nowIso()
  doc.approvedBy = actor(user)
  doc.updatedAt = doc.approvedAt
  audit(workspace.id, { documentId: id, action: 'document.approved', user, detail: `v${doc.version}` })
  commit()
  return withIssues(doc, workspace.id)
}

export async function listVersions(id) {
  await latency()
  findDoc(id)
  return db.versions.filter((v) => v.documentId === id).sort((a, b) => b.version - a.version)
}

export async function restoreVersion(id, versionId) {
  const v = db.versions.find((x) => x.id === versionId && x.documentId === id)
  if (!v) throw new ApiError('That version no longer exists.', { status: 404, code: 'not_found' })
  const doc = findDoc(id)
  return updateDocument(id, { title: v.title, content: v.content, expectedVersion: doc.version })
}

export async function listAudit({ documentId } = {}) {
  await latency()
  const { workspace } = ctx()
  return db.audit.filter((a) => a.workspaceId === workspace.id && (!documentId || a.documentId === documentId))
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100)
}

export async function deleteDocument(id) {
  await latency()
  const { workspace, role, user } = ctx()
  need(role, ['owner', 'editor'])
  const doc = findDoc(id)
  db.documents = db.documents.filter((d) => d !== doc)
  db.versions = db.versions.filter((v) => v.documentId !== id)
  audit(workspace.id, { documentId: id, action: 'document.deleted', user, detail: doc.title })
  commit()
}

/** Resolves to { blob, filename }. PDF and DOCX need the API server. */
export async function exportDocument(id, format) {
  await latency()
  const { workspace, user } = ctx()
  const doc = findDoc(id)
  const t = findTemplate(workspace.id, doc.templateId)
  const base = doc.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'document'
  let blob
  if (format === 'json') blob = new Blob([JSON.stringify({ template: t.id, title: doc.title, status: doc.status, version: doc.version, content: doc.content }, null, 2)], { type: 'application/json' })
  else if (format === 'md') blob = new Blob([toMarkdown(t, doc.content)], { type: 'text/markdown' })
  else throw new ApiError(`${format.toUpperCase()} export runs on the API server. In this preview, export Markdown or JSON.`, { status: 501, code: 'needs_server' })
  audit(workspace.id, { documentId: id, action: 'document.exported', user, detail: format.toUpperCase() })
  commit()
  return { blob, filename: `${base}.${format}` }
}

/* --------------------------------------------------------------- overview */

export async function getOverview() {
  await latency()
  const { workspace } = ctx()
  const docs = db.documents.filter((d) => d.workspaceId === workspace.id)
  return {
    usage: usageFor(workspace),
    counts: {
      documents: docs.length,
      awaitingReview: docs.filter((d) => d.status === 'draft').length,
      approved: docs.filter((d) => d.status === 'approved').length,
    },
    recent: docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6).map((d) => withIssues(d, workspace.id)).map(({ content, ...d }) => d),
    running: db.jobs.filter((j) => j.workspaceId === workspace.id).map(materialize).filter((j) => j.status === 'running' || j.status === 'queued').map(publicJob),
  }
}

/** Test helper: wipe the local mock database. */
export function __reset() {
  db = structuredClone(EMPTY)
  commit()
}
