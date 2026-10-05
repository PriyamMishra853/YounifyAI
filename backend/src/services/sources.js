import { planById } from '@younifyai/shared'
import { HttpError, invalid, notFound } from '../lib/errors.js'
import { uuidv7 } from '../lib/util.js'
import { audit } from './audit.js'
import { sourceOut } from './serialize.js'

/**
 * Split reference text into retrieval-sized chunks, keeping lines together
 * (price lists and syllabi are line-oriented). ~700 characters each.
 */
export function chunkText(text, size = 700) {
  const lines = String(text).split(/\r?\n/)
  const chunks = []
  let cur = ''
  for (const line of lines) {
    if (cur && cur.length + line.length + 1 > size) {
      chunks.push(cur.trim())
      cur = ''
    }
    if (line.length > size) {
      for (let i = 0; i < line.length; i += size) chunks.push(line.slice(i, i + size))
      continue
    }
    cur += `${line}\n`
  }
  if (cur.trim()) chunks.push(cur.trim())
  return chunks.filter(Boolean)
}

/** Store chunks with their embeddings (when an embedder is available) and index them. */
export async function insertChunks(q, { sourceId, workspaceId, templateId = null, title = '', chunks, ai, vectorStore }) {
  const vectors = ai ? await ai.embed(chunks) : null
  for (const [i, chunk] of chunks.entries()) {
    await q.query(
      'insert into app.source_chunks (source_id, workspace_id, position, content, embedding, embed_model) values ($1, $2, $3, $4, $5, $6)',
      [sourceId, workspaceId, i, chunk, vectors?.[i] ? `[${vectors[i].join(',')}]` : null, vectors ? ai.models.embed : null],
    )
  }
  await vectorStore?.index({ sourceId, workspaceId, templateId, title, chunks, vectors, model: ai?.models.embed })
}

export async function listSources(q) {
  const rows = await q.query(
    `select id, workspace_id, title, template_id, kind, chars, left(text_content, 180) as preview, created_at
       from app.sources order by created_at desc`,
  )
  return rows.map(sourceOut)
}

/**
 * Add reference material. `text` is already extracted (the route runs uploaded
 * files through the extractor); `ai` embeds the chunks and `vectorStore` indexes them.
 */
export async function addSource(q, ctx, { title, templateId, text, kind, mime, storageKey }, { ai, vectorStore } = {}) {
  const limit = planById(ctx.workspace.plan).limits.sources
  if (limit != null) {
    const { n } = await q.one('select count(*)::int as n from app.sources')
    if (n >= limit) throw new HttpError(402, 'plan_limit', `Your plan allows ${limit} reference sources. Delete one or upgrade.`)
  }
  if (!text?.trim()) throw invalid('The source is empty.', { text: 'Paste some text or choose a file with readable text.' })
  if (templateId) {
    const t = await q.one('select 1 from app.templates where id = $1 and deleted_at is null', [templateId])
    if (!t) throw invalid('That template no longer exists.', { templateId: 'Pick another template.' })
  }
  const id = uuidv7()
  const row = await q.one(
    `insert into app.sources (id, workspace_id, template_id, title, kind, mime, storage_key, text_content, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id, workspace_id, title, template_id, kind, chars, left(text_content, 180) as preview, created_at`,
    [id, ctx.workspace.id, templateId || null, title.trim(), kind, mime || null, storageKey || null, text, ctx.user.id],
  )
  const chunks = chunkText(text)
  await insertChunks(q, { sourceId: id, workspaceId: ctx.workspace.id, templateId: templateId || null, title: row.title, chunks, ai, vectorStore })
  await audit(q, { workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: 'source.added', detail: row.title, meta: { chunks: chunks.length } })
  return sourceOut(row)
}

export async function deleteSource(q, ctx, id) {
  const s = await q.one('delete from app.sources where id = $1 returning title, storage_key', [id])
  if (!s) throw notFound('That source no longer exists.')
  await audit(q, { workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: 'source.deleted', detail: s.title })
  return s
}

/** Sources that apply to a template: its own plus the workspace-wide ones. */
export async function sourcesForTemplate(q, templateId) {
  return q.query(
    `select id, title, text_content from app.sources
      where template_id is null or template_id = $1 order by created_at`,
    [templateId],
  )
}
