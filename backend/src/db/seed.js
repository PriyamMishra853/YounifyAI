import { SYSTEM_TEMPLATES } from '@younifyai/shared'

/** Upsert the built-in templates from the shared catalog. Runs on every boot. */
export async function seedSystemTemplates(db) {
  for (const t of SYSTEM_TEMPLATES) {
    await db.query(
      `insert into app.templates (id, workspace_id, name, description, instructions, vertical, stage, flow, accepts, fields)
       values ($1, null, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       on conflict (id) do update set
         name = excluded.name, description = excluded.description, instructions = excluded.instructions,
         vertical = excluded.vertical, stage = excluded.stage, flow = excluded.flow,
         accepts = excluded.accepts, fields = excluded.fields, updated_at = now()
       where app.templates.workspace_id is null`,
      [t.id, t.name, t.description, t.instructions || '', t.vertical, t.stage, t.flow, t.accepts, JSON.stringify(t.fields)],
    )
  }
}
