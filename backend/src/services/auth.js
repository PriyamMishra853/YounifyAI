import { SAMPLE_PRICE_LIST, sampleDocuments, templateById } from '@younifyai/shared'
import { conflict, unauthenticated } from '../lib/errors.js'
import { hashPassword, newToken, sha256, uuidv7, verifyPassword } from '../lib/util.js'
import { audit } from './audit.js'
import { userOut, workspaceOut } from './serialize.js'
import { chunkText, insertChunks } from './sources.js'

const DAY = 24 * 60 * 60 * 1000

async function createSession(q, { userId, workspaceId, days, meta = {} }) {
  const token = newToken()
  await q.query(
    `insert into app.sessions (id, user_id, workspace_id, token_hash, user_agent, ip, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [uuidv7(), userId, workspaceId, sha256(token), meta.userAgent?.slice(0, 300) || null, meta.ip || null, new Date(Date.now() + days * DAY)],
  )
  return token
}

/** Sample documents and a price list so a new workspace has something to open. */
async function seedWorkspace(q, { workspaceId, userId, ai, vectorStore }) {
  for (const s of sampleDocuments()) {
    const t = templateById(s.templateId)
    const id = uuidv7()
    const title = s.content.title || `${t.name} #${s.content.bill_no}`
    const approved = s.status === 'approved'
    await q.query(
      `insert into app.documents (id, workspace_id, template_id, title, status, content, inputs, is_sample, engine, created_by, approved_by, approved_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, true, 'sample', $8, $9, $10)`,
      [id, workspaceId, s.templateId, title, s.status, JSON.stringify(s.content), JSON.stringify(s.inputs), userId, approved ? userId : null, approved ? new Date() : null],
    )
    await q.query(
      `insert into app.document_versions (id, document_id, workspace_id, version, title, content, note)
       values ($1, $2, $3, 1, $4, $5::jsonb, 'Generated')`,
      [uuidv7(), id, workspaceId, title, JSON.stringify(s.content)],
    )
    await audit(q, { workspaceId, documentId: id, action: 'document.generated', detail: `${t.name} sample` })
    if (approved) await audit(q, { workspaceId, documentId: id, actorId: userId, action: 'document.approved', detail: 'v1' })
  }
  const sourceId = uuidv7()
  await q.query(
    `insert into app.sources (id, workspace_id, template_id, title, kind, text_content, created_by)
     values ($1, $2, 'voice_bill', 'Store price list', 'text', $3, $4)`,
    [sourceId, workspaceId, SAMPLE_PRICE_LIST, userId],
  )
  await insertChunks(q, { sourceId, workspaceId, templateId: 'voice_bill', title: 'Store price list', chunks: chunkText(SAMPLE_PRICE_LIST), ai, vectorStore })
}

export async function signup({ db, config, ai, vectors }, { name, email, password }, meta) {
  const normalized = email.trim().toLowerCase()
  const exists = await db.one('select 1 from app.users where email = $1', [normalized])
  if (exists) throw conflict('email_taken', 'An account with this email already exists. Sign in instead.', { email: 'Already registered.' })
  const passwordHash = await hashPassword(password)

  return db.tx(async (q) => {
    const userId = uuidv7()
    const workspaceId = uuidv7()
    const first = name.trim().split(/\s+/)[0]
    await q.query('insert into app.users (id, email, name, password_hash) values ($1, $2, $3, $4)', [userId, normalized, name.trim(), passwordHash])
    await q.query('insert into app.workspaces (id, name) values ($1, $2)', [workspaceId, `${first}’s workspace`])
    await q.query(
      `insert into app.memberships (id, workspace_id, user_id, email, role, status, joined_at)
       values ($1, $2, $3, $4, 'owner', 'active', now())`,
      [uuidv7(), workspaceId, userId, normalized],
    )
    // pending invitations to this email become real memberships
    await q.query(
      `update app.memberships set user_id = $1, status = 'active', joined_at = now()
        where email = $2 and status = 'invited'`,
      [userId, normalized],
    )
    await seedWorkspace(q, { workspaceId, userId, ai, vectorStore: vectors })
    await audit(q, { workspaceId, actorId: userId, action: 'workspace.created', detail: `${first}’s workspace` })
    const token = await createSession(q, { userId, workspaceId, days: config.sessionDays, meta })
    return { token }
  })
}

export async function login(db, config, { email, password }, meta) {
  const user = await db.one('select * from app.users where email = $1', [String(email).trim().toLowerCase()])
  // verify against a dummy hash when the email is unknown, so timing does not reveal accounts
  const ok = await verifyPassword(password, user?.password_hash || 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA')
  if (!user || !ok) throw unauthenticated('That email and password do not match an account.')
  const membership = await db.one(
    `select workspace_id from app.memberships where user_id = $1 and status = 'active'
      order by (role = 'owner') desc, joined_at asc limit 1`,
    [user.id],
  )
  const token = await db.tx((q) => createSession(q, { userId: user.id, workspaceId: membership?.workspace_id ?? null, days: config.sessionDays, meta }))
  return { token }
}

export async function logout(db, token) {
  if (token) await db.query('delete from app.sessions where token_hash = $1', [sha256(token)])
}

/**
 * Resolve a session cookie into the request context:
 * { session, user, workspace, role } — or null when the token is unknown or expired.
 * Sessions slide: each day of use pushes the expiry forward.
 */
export async function resolveSession(db, config, token) {
  if (!token) return null
  const row = await db.one(
    `select s.id as session_id, s.workspace_id as session_workspace_id, s.expires_at, s.last_seen_at,
            u.id as user_id, u.name, u.email, u.created_at as user_created_at
       from app.sessions s join app.users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  )
  if (!row) return null

  let m = await db.one(
    `select m.role, w.* from app.memberships m join app.workspaces w on w.id = m.workspace_id
      where m.user_id = $1 and m.workspace_id = $2 and m.status = 'active'`,
    [row.user_id, row.session_workspace_id],
  )
  if (!m) {
    // removed from the workspace, or it was deleted: fall back to another membership
    m = await db.one(
      `select m.role, w.* from app.memberships m join app.workspaces w on w.id = m.workspace_id
        where m.user_id = $1 and m.status = 'active' order by (m.role = 'owner') desc, m.joined_at asc limit 1`,
      [row.user_id],
    )
    await db.query('update app.sessions set workspace_id = $1 where id = $2', [m?.id ?? null, row.session_id])
  }
  if (Date.now() - new Date(row.last_seen_at).getTime() > DAY) {
    await db.query('update app.sessions set last_seen_at = now(), expires_at = $1 where id = $2', [new Date(Date.now() + config.sessionDays * DAY), row.session_id])
  }
  return {
    sessionId: row.session_id,
    user: userOut({ id: row.user_id, name: row.name, email: row.email, created_at: row.user_created_at }),
    workspace: m ? workspaceOut(m) : null,
    role: m?.role ?? null,
  }
}

export async function updateProfile(db, userId, { name }) {
  const u = await db.one('update app.users set name = $1, updated_at = now() where id = $2 returning *', [name.trim(), userId])
  return userOut(u)
}
