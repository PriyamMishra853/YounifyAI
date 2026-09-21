import { planById } from '@younifyai/shared'
import { conflict, forbidden, notFound, planRequired } from '../lib/errors.js'
import { istDay, uuidv7 } from '../lib/util.js'
import { audit } from './audit.js'
import { memberOut, workspaceOut } from './serialize.js'

/** Documents started today (India time) against the plan's daily allowance. */
export async function usage(q, workspace) {
  const plan = planById(workspace.plan)
  const { start, end } = istDay()
  const { used } = await q.one('select count(*)::int as used from app.jobs where workspace_id = $1 and created_at >= $2', [workspace.id, start])
  return { plan: plan.id, used, limit: plan.tasksPerDay, unlimited: !!plan.unlimited, resetsAt: end.toISOString() }
}

export async function rename(q, ctx, name) {
  const w = await q.one('update app.workspaces set name = $1, updated_at = now() where id = $2 returning *', [name.trim(), ctx.workspace.id])
  await audit(q, { workspaceId: w.id, actorId: ctx.user.id, action: 'workspace.renamed', detail: w.name })
  return workspaceOut(w)
}

export async function changePlan(q, ctx, planId) {
  const w = await q.one('update app.workspaces set plan = $1, updated_at = now() where id = $2 returning *', [planId, ctx.workspace.id])
  await audit(q, { workspaceId: w.id, actorId: ctx.user.id, action: 'workspace.plan_changed', detail: planId })
  return usage(q, w)
}

/* --------------------------------------------------------------- members */

const MEMBER_SELECT = `
  select m.*, u.name as user_name
    from app.memberships m left join app.users u on u.id = m.user_id`

export async function listMembers(q) {
  const rows = await q.query(`${MEMBER_SELECT} order by m.status, (m.role = 'owner') desc, m.created_at`)
  return rows.map(memberOut)
}

/**
 * Invite by email. Someone who already has an account joins at once; anyone else
 * joins when they sign up with that email. (Invitation emails are out of scope.)
 * `existingUserId` is looked up by the caller *before* the workspace transaction:
 * app_user cannot search accounts, and on PGlite a second query outside an open
 * transaction would wait for it forever.
 */
export async function invite(q, ctx, { email, role, existingUserId }) {
  if (!planById(ctx.workspace.plan).limits.members) throw planRequired('Workspace members are part of the Pro plan.')
  const normalized = email.trim().toLowerCase()
  const taken = await q.one('select 1 from app.memberships where email = $1', [normalized])
  if (taken) throw conflict('exists', 'That person is already in this workspace.')
  const existing = existingUserId ? { id: existingUserId } : null
  const row = await q.one(
    `insert into app.memberships (id, workspace_id, user_id, email, role, status, invited_by, joined_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [uuidv7(), ctx.workspace.id, existing?.id ?? null, normalized, role, existing ? 'active' : 'invited', ctx.user.id, existing ? new Date() : null],
  )
  await audit(q, { workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: 'member.invited', detail: `${normalized} as ${role}` })
  return memberOut({ ...row, user_name: null })
}

async function ownerCount(q) {
  return (await q.one(`select count(*)::int as n from app.memberships where role = 'owner' and status = 'active'`)).n
}

export async function updateRole(q, ctx, memberId, role) {
  const m = await q.one(`${MEMBER_SELECT} where m.id = $1`, [memberId])
  if (!m) throw notFound('Member not found.')
  if (m.role === 'owner' && role !== 'owner' && m.status === 'active' && (await ownerCount(q)) <= 1) {
    throw conflict('last_owner', 'A workspace needs at least one owner.')
  }
  const row = await q.one('update app.memberships set role = $1 where id = $2 returning *', [role, memberId])
  await audit(q, { workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: 'member.role_changed', detail: `${m.email} → ${role}` })
  return memberOut({ ...row, user_name: m.user_name })
}

export async function removeMember(q, ctx, memberId) {
  const m = await q.one('select * from app.memberships where id = $1', [memberId])
  if (!m) return
  if (m.user_id === ctx.user.id) throw conflict('self', 'You cannot remove yourself.')
  if (m.role === 'owner' && (await ownerCount(q)) <= 1) throw conflict('last_owner', 'A workspace needs at least one owner.')
  await q.query('delete from app.memberships where id = $1', [memberId])
  await audit(q, { workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: 'member.removed', detail: m.email })
}

/* ------------------------------------------------------ switching workspace */

export async function listMine(db, userId) {
  const rows = await db.query(
    `select w.*, m.role from app.memberships m join app.workspaces w on w.id = m.workspace_id
      where m.user_id = $1 and m.status = 'active' order by m.joined_at`,
    [userId],
  )
  return rows.map((r) => ({ ...workspaceOut(r), role: r.role }))
}

export async function switchWorkspace(db, ctx, workspaceId) {
  const m = await db.one(`select 1 from app.memberships where user_id = $1 and workspace_id = $2 and status = 'active'`, [ctx.user.id, workspaceId])
  if (!m) throw forbidden('You are not a member of that workspace.')
  await db.query('update app.sessions set workspace_id = $1 where id = $2', [workspaceId, ctx.sessionId])
}
