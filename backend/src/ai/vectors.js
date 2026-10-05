// Where retrieval vectors live.
//   pgvector (default): source_chunks.embedding, searched with the cosine operator <=>,
//                       inside the workspace's transaction so row-level security applies.
//   Qdrant (QDRANT_URL): one collection; every point carries workspace_id and every
//                       search filters on it, since Postgres RLS does not reach Qdrant.
// Both expose: index(chunks), search(W, query), removeSource(sourceId).

import { EMBED_DIMS } from './offline.js'

function pgvectorStore() {
  return {
    kind: 'pgvector',
    async index() { /* vectors are stored with the chunk rows by insertChunks */ },
    async search(W, { templateId, vector, k, model }) {
      return W((q) => q.query(
        `select c.content, s.title, 1 - (c.embedding <=> $2::vector) as score
           from app.source_chunks c join app.sources s on s.id = c.source_id
          where (s.template_id is null or s.template_id = $1) and c.embed_model = $4
          order by c.embedding <=> $2::vector
          limit $3`,
        [templateId, `[${vector.join(',')}]`, k, model],
      ))
    },
    async removeSource() { /* chunk rows cascade with the source */ },
  }
}

function qdrantStore({ qdrantUrl, qdrantApiKey }, log) {
  const collection = 'younify_chunks'
  const base = qdrantUrl.replace(/\/$/, '')
  let ready = null
  const call = async (method, route, body) => {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(qdrantApiKey ? { 'api-key': qdrantApiKey } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`Qdrant ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return res.json()
  }
  const ensure = () => (ready ||= (async () => {
    const exists = await fetch(`${base}/collections/${collection}`, { headers: qdrantApiKey ? { 'api-key': qdrantApiKey } : {} }).then((r) => r.ok).catch(() => false)
    if (!exists) {
      await call('PUT', `/collections/${collection}`, { vectors: { size: EMBED_DIMS, distance: 'Cosine' } })
      for (const field of ['workspace_id', 'source_id', 'scope', 'embed_model']) {
        await call('PUT', `/collections/${collection}/index`, { field_name: field, field_schema: 'keyword' })
      }
      log?.info({ collection }, 'qdrant collection created')
    }
  })().catch((e) => { ready = null; throw e }))

  return {
    kind: 'qdrant',
    async index({ sourceId, workspaceId, templateId, title, chunks, vectors, model }) {
      if (!vectors) return
      await ensure()
      await call('PUT', `/collections/${collection}/points?wait=true`, {
        points: chunks.map((content, i) => ({
          id: crypto.randomUUID(),
          vector: vectors[i],
          payload: { workspace_id: workspaceId, source_id: sourceId, scope: templateId || '*', title, content, embed_model: model, position: i },
        })),
      })
    },
    async search(W, { workspaceId, templateId, vector, k, model }) {
      await ensure()
      const data = await call('POST', `/collections/${collection}/points/search`, {
        vector,
        limit: k,
        with_payload: true,
        filter: {
          must: [
            { key: 'workspace_id', match: { value: workspaceId } },
            { key: 'embed_model', match: { value: model } },
            { key: 'scope', match: { any: [templateId, '*'] } },
          ],
        },
      })
      return (data.result || []).map((p) => ({ content: p.payload.content, title: p.payload.title, score: p.score }))
    },
    async removeSource(sourceId) {
      await ensure()
      await call('POST', `/collections/${collection}/points/delete?wait=true`, { filter: { must: [{ key: 'source_id', match: { value: sourceId } }] } })
    },
  }
}

export function createVectorStore(config, log) {
  const store = config.ai.qdrantUrl ? qdrantStore(config.ai, log) : pgvectorStore()
  log?.info({ vectors: store.kind }, 'vector store ready')
  return store
}
