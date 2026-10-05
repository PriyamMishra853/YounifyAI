// Row → API shape. Every response the frontend sees is built here, so the
// contract in docs/04-api-reference.md has one place to change.
import { validateDocument } from '@younifyai/shared'
import { iso } from '../lib/util.js'

export const actorOut = (id, name) => (id ? { id, name: name || 'Former member' } : null)

export const userOut = (u) => ({ id: u.id, name: u.name, email: u.email, createdAt: iso(u.created_at) })

export const workspaceOut = (w) => ({ id: w.id, name: w.name, plan: w.plan, createdAt: iso(w.created_at) })

export const templateOut = (t) => ({
  id: t.id,
  workspaceId: t.workspace_id,
  system: t.workspace_id == null,
  name: t.name,
  description: t.description,
  instructions: t.instructions,
  vertical: t.vertical,
  stage: t.stage,
  flow: t.flow,
  accepts: t.accepts,
  fields: t.fields,
  createdAt: iso(t.created_at),
  deleted: !!t.deleted_at,
})

export const memberOut = (m) => ({
  id: m.id,
  workspaceId: m.workspace_id,
  userId: m.user_id,
  name: m.user_name || m.email.split('@')[0],
  email: m.email,
  role: m.role,
  status: m.status,
  joinedAt: iso(m.joined_at),
})

export const sourceOut = (s) => ({
  id: s.id,
  workspaceId: s.workspace_id,
  title: s.title,
  templateId: s.template_id,
  kind: s.kind,
  chars: s.chars,
  preview: (s.preview ?? s.text_content ?? '').slice(0, 180),
  createdAt: iso(s.created_at),
})

export const inputOut = (i) => ({ id: i.id, kind: i.kind, name: i.name, size: Number(i.size_bytes), url: i.source_url || undefined, chars: i.extracted_text?.length ?? undefined })

export const stageOut = (s) => ({
  key: s.stage,
  status: s.status,
  startedAt: iso(s.started_at),
  finishedAt: iso(s.finished_at),
  log: s.log || [],
})

export const jobOut = (j, inputs = [], stages = []) => ({
  id: j.id,
  workspaceId: j.workspace_id,
  templateId: j.template_id,
  templateName: j.template_name,
  status: j.status,
  instructions: j.instructions,
  inputs: inputs.map(inputOut),
  stages: stages.sort((a, b) => a.position - b.position).map(stageOut),
  documentId: j.document_id,
  error: j.error,
  createdAt: iso(j.created_at),
  finishedAt: iso(j.finished_at),
})

/** `template` is the row for d.template_id; it drives templateName, issues and the embedded definition. */
export function documentOut(d, template, { withContent = true } = {}) {
  const out = {
    id: d.id,
    workspaceId: d.workspace_id,
    templateId: d.template_id,
    templateName: template?.name || 'Deleted template',
    title: d.title,
    status: d.status,
    version: d.version,
    jobId: d.job_id,
    inputs: d.inputs || [],
    sample: d.is_sample,
    engine: d.engine,
    createdAt: iso(d.created_at),
    updatedAt: iso(d.updated_at),
    approvedAt: iso(d.approved_at),
    approvedBy: actorOut(d.approved_by, d.approved_by_name),
    createdBy: actorOut(d.created_by, d.created_by_name),
    issues: template ? validateDocument(template, d.content).issues : [],
  }
  if (withContent) {
    out.content = d.content
    out.template = template ? templateOut(template) : null
  } else {
    const c = d.content || {}
    out.excerpt = String(c.summary || c.entry || c.notes || '').slice(0, 140)
  }
  return out
}

export const versionOut = (v) => ({
  id: v.id,
  documentId: v.document_id,
  version: v.version,
  title: v.title,
  content: v.content,
  note: v.note,
  createdAt: iso(v.created_at),
  createdBy: actorOut(v.created_by, v.created_by_name),
})

export const auditOut = (a) => ({
  id: String(a.id),
  documentId: a.document_id,
  action: a.action,
  actor: actorOut(a.actor_id, a.actor_name),
  detail: a.detail,
  at: iso(a.created_at),
})
