import { auditOut } from './serialize.js'

/** Append one event to the audit trail. `q` must be inside the workspace's transaction. */
export async function audit(q, { workspaceId, documentId = null, actorId = null, action, detail = '', meta = {} }) {
  await q.query(
    `insert into app.audit_events (workspace_id, document_id, actor_id, action, detail, meta)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [workspaceId, documentId, actorId, action, detail, JSON.stringify(meta)],
  )
}

export async function listAudit(q, { documentId = null, limit = 100 } = {}) {
  const rows = await q.query(
    `select a.*, u.name as actor_name
       from app.audit_events a
       left join app.users u on u.id = a.actor_id
      where ($1::uuid is null or a.document_id = $1)
      order by a.created_at desc, a.id desc
      limit $2`,
    [documentId, limit],
  )
  return rows.map(auditOut)
}
