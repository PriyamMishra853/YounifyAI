import { normalizeContent, validateDocument } from '@younifyai/shared'
import { conflict, invalid, notFound } from '../lib/errors.js'
import { uuidv7 } from '../lib/util.js'
import { audit } from './audit.js'
import { documentOut, versionOut } from './serialize.js'
import { getTemplateRow } from './templates.js'

const DOC_SELECT = `
  select d.*, cu.name as created_by_name, au.name as approved_by_name
    from app.documents d
    left join app.users cu on cu.id = d.created_by
    left join app.users au on au.id = d.approved_by`

const SORTS = {
  updated: 'd.updated_at desc',
  created: 'd.created_at desc',
  title: 'lower(d.title) asc',
}

export async function listDocuments(q, { q: search = '', status = '', templateId = '', sort = 'updated', limit = 200 } = {}) {
  const needle = search.trim()
  const rows = await q.query(
    `${DOC_SELECT}
      where ($1::text = '' or d.search @@ websearch_to_tsquery('simple', $1) or d.title ilike $2 or d.content::text ilike $2)
        and ($3::text = '' or d.status = $3)
        and ($4::text = '' or d.template_id = $4)
      order by ${SORTS[sort] || SORTS.updated}
      limit $5`,
    [needle, `%${needle.replace(/[%_\\]/g, (c) => `\\${c}`)}%`, status, templateId, limit],
  )
  const templates = await templatesFor(q, rows)
  return rows.map((d) => documentOut(d, templates.get(d.template_id), { withContent: false }))
}

async function templatesFor(q, docs) {
  const ids = [...new Set(docs.map((d) => d.template_id))]
  const rows = ids.length ? await q.query('select * from app.templates where id = any($1::text[])', [ids]) : []
  return new Map(rows.map((t) => [t.id, t]))
}

async function loadDoc(q, id) {
  const d = await q.one(`${DOC_SELECT} where d.id = $1`, [id])
  if (!d) throw notFound('This document does not exist in your workspace.')
  return d
}

export async function getDocument(q, id) {
  const d = await loadDoc(q, id)
  return documentOut(d, await getTemplateRow(q, d.template_id))
}

/**
 * Save an edit as a new version. `expectedVersion` guards against two people
 * overwriting each other. Editing an approved document withdraws the approval.
 */
export async function updateDocument(q, ctx, id, { title, content, expectedVersion }) {
  const d = await loadDoc(q, id)
  if (expectedVersion != null && expectedVersion !== d.version) {
    throw conflict('version_conflict', 'Someone else saved this document since you opened it. Reload to see their changes.')
  }
  const template = await getTemplateRow(q, d.template_id)
  const next = content != null ? normalizeContent(template, content) : d.content
  const nextTitle = title?.trim() || d.title
  const wasApproved = d.status === 'approved'
  const updated = await q.one(
    `update app.documents
        set title = $2, content = $3::jsonb, version = version + 1, status = 'draft',
            approved_by = null, approved_at = null, updated_at = now()
      where id = $1 and version = $4
      returning version`,
    [id, nextTitle, JSON.stringify(next), d.version],
  )
  if (!updated) throw conflict('version_conflict', 'Someone else saved this document since you opened it. Reload to see their changes.')
  await q.query(
    `insert into app.document_versions (id, document_id, workspace_id, version, title, content, note, created_by)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [uuidv7(), id, ctx.workspace.id, updated.version, nextTitle, JSON.stringify(next), 'Edited', ctx.user.id],
  )
  await audit(q, {
    workspaceId: ctx.workspace.id, documentId: id, actorId: ctx.user.id, action: 'document.edited',
    detail: wasApproved ? `v${updated.version} · approval withdrawn` : `v${updated.version}`,
  })
  return getDocument(q, id)
}

export async function approveDocument(q, ctx, id) {
  const d = await loadDoc(q, id)
  if (d.status === 'approved') return documentOut(d, await getTemplateRow(q, d.template_id))
  const template = await getTemplateRow(q, d.template_id)
  const { ok, issues } = validateDocument(template, d.content)
  if (!ok) {
    const n = issues.filter((i) => i.level === 'error').length
    throw invalid(`Fix ${n} problem${n > 1 ? 's' : ''} before approving.`)
  }
  await q.query(
    `update app.documents set status = 'approved', approved_by = $2, approved_at = now(), updated_at = now() where id = $1`,
    [id, ctx.user.id],
  )
  await audit(q, { workspaceId: ctx.workspace.id, documentId: id, actorId: ctx.user.id, action: 'document.approved', detail: `v${d.version}` })
  return getDocument(q, id)
}

export async function listVersions(q, id) {
  await loadDoc(q, id)
  const rows = await q.query(
    `select v.*, u.name as created_by_name from app.document_versions v
       left join app.users u on u.id = v.created_by
      where v.document_id = $1 order by v.version desc`,
    [id],
  )
  return rows.map(versionOut)
}

export async function restoreVersion(q, ctx, id, versionId) {
  const d = await loadDoc(q, id)
  const v = await q.one('select * from app.document_versions where id = $1 and document_id = $2', [versionId, id])
  if (!v) throw notFound('That version no longer exists.')
  const doc = await updateDocument(q, ctx, id, { title: v.title, content: v.content, expectedVersion: d.version })
  await q.query(`update app.document_versions set note = $3 where document_id = $1 and version = $2`, [id, doc.version, `Restored v${v.version}`])
  await audit(q, { workspaceId: ctx.workspace.id, documentId: id, actorId: ctx.user.id, action: 'document.restored', detail: `v${v.version} → v${doc.version}` })
  return doc
}

export async function deleteDocument(q, ctx, id) {
  const d = await loadDoc(q, id)
  await q.query('delete from app.documents where id = $1', [id])
  await audit(q, { workspaceId: ctx.workspace.id, documentId: id, actorId: ctx.user.id, action: 'document.deleted', detail: d.title })
}

export async function overview(q, usageNow) {
  const counts = await q.one(
    `select count(*)::int as documents,
            count(*) filter (where status = 'draft')::int as awaiting,
            count(*) filter (where status = 'approved')::int as approved
       from app.documents`,
  )
  const recentRows = await q.query(`${DOC_SELECT} order by d.updated_at desc limit 6`)
  const templates = await templatesFor(q, recentRows)
  return {
    usage: usageNow,
    counts: { documents: counts.documents, awaitingReview: counts.awaiting, approved: counts.approved },
    recent: recentRows.map((d) => documentOut(d, templates.get(d.template_id), { withContent: false })),
  }
}
