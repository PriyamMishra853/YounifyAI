import { z } from 'zod'
import { MODALITY_ORDER, planById } from '@younifyai/shared'
import { conflict, forbidden, notFound, planRequired } from '../lib/errors.js'
import { uuidv7 } from '../lib/util.js'
import { audit } from './audit.js'
import { templateOut } from './serialize.js'

const KEY = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Field keys use lowercase letters, digits and underscores.')
const SCALAR = z.enum(['text', 'longtext', 'number', 'money', 'date'])

const fieldSchema = z
  .object({
    key: KEY,
    label: z.string().trim().min(1, 'Every field needs a label.').max(60),
    type: z.enum(['text', 'longtext', 'number', 'money', 'date', 'list', 'table']),
    required: z.boolean().optional().default(false),
    columns: z.array(z.object({ key: KEY, label: z.string().trim().min(1).max(40), type: SCALAR })).min(1).max(10).optional(),
  })
  .refine((f) => f.type !== 'table' || f.columns?.length, { message: 'Table fields need at least one column.', path: ['columns'] })

export const templateInput = z.object({
  name: z.string().trim().min(1, 'Name the template.').max(80),
  description: z.string().trim().max(300).optional().default(''),
  instructions: z.string().trim().max(2000).optional().default(''),
  vertical: z.string().trim().max(40).optional().default('Custom'),
  flow: z.string().trim().max(60).optional().default(''),
  accepts: z.array(z.enum(MODALITY_ORDER)).min(1, 'Accept at least one kind of input.').optional().default(MODALITY_ORDER),
  fields: z
    .array(fieldSchema)
    .min(1, 'Add at least one field.')
    .max(40)
    .refine((fs) => new Set(fs.map((f) => f.key)).size === fs.length, { message: 'Two fields share the same key.' }),
})

export async function listTemplates(q) {
  const rows = await q.query(
    `select * from app.templates where deleted_at is null
      order by (workspace_id is null) desc, case stage when 'mvp' then 0 when 'expansion' then 1 else 2 end, created_at`,
  )
  return rows.map(templateOut)
}

/** Includes soft-deleted templates: documents made from them still need the schema. */
export async function getTemplateRow(q, id) {
  return q.one('select * from app.templates where id = $1', [id])
}

function requireCustomPlan(ctx) {
  if (!planById(ctx.workspace.plan).limits.customTemplates) throw planRequired('Custom templates are part of the Pro plan.')
}

export async function createTemplate(q, ctx, input) {
  requireCustomPlan(ctx)
  const id = `tpl_${uuidv7().replace(/-/g, '')}`
  const row = await q.one(
    `insert into app.templates (id, workspace_id, name, description, instructions, vertical, stage, flow, accepts, fields, created_by)
     values ($1, $2, $3, $4, $5, $6, 'custom', $7, $8, $9::jsonb, $10) returning *`,
    [id, ctx.workspace.id, input.name, input.description, input.instructions, input.vertical, input.flow, input.accepts, JSON.stringify(input.fields), ctx.user.id],
  )
  await audit(q, { workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: 'template.created', detail: row.name })
  return templateOut(row)
}

export async function updateTemplate(q, ctx, id, input) {
  requireCustomPlan(ctx)
  const current = await getTemplateRow(q, id)
  if (!current || current.deleted_at) throw notFound('That template no longer exists.')
  if (current.workspace_id == null) throw forbidden('Built-in templates cannot be edited. Duplicate it instead.')
  const row = await q.one(
    `update app.templates set name = $2, description = $3, instructions = $4, vertical = $5, flow = $6,
            accepts = $7, fields = $8::jsonb, updated_at = now()
      where id = $1 returning *`,
    [id, input.name, input.description, input.instructions, input.vertical, input.flow, input.accepts, JSON.stringify(input.fields)],
  )
  await audit(q, { workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: 'template.updated', detail: row.name })
  return templateOut(row)
}

export async function deleteTemplate(q, ctx, id) {
  const current = await getTemplateRow(q, id)
  if (!current || current.deleted_at) return
  if (current.workspace_id == null) throw conflict('system_template', 'Built-in templates cannot be deleted.')
  await q.query('update app.templates set deleted_at = now() where id = $1', [id])
  await audit(q, { workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: 'template.deleted', detail: current.name })
}
