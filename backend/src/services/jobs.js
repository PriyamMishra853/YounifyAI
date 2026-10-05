import { MODALITIES, PIPELINE_STAGES, modalityOf } from '@younifyai/shared'
import { HttpError, invalid, notFound } from '../lib/errors.js'
import { safeFileName, uuidv7 } from '../lib/util.js'
import { audit } from './audit.js'
import { jobOut } from './serialize.js'
import { usage } from './workspaces.js'

/**
 * Create a capture job: store the inputs, enforce the daily allowance and queue
 * the job for the pipeline worker. `files` come from multer (already on disk in tmp).
 */
export async function createJob({ db, storage, events }, ctx, { templateId, instructions = '', texts = [], files = [], links = [] }) {
  const jobId = uuidv7()
  const wsId = ctx.workspace.id
  const inputs = [
    ...texts.filter((t) => t.text?.trim()).map((t, i) => ({
      id: uuidv7(), kind: 'text', name: safeFileName(t.name || `pasted_text_${i + 1}.txt`), mime: 'text/plain', size: Buffer.byteLength(t.text), text: t.text,
    })),
    ...files.map((f) => ({
      id: uuidv7(), kind: modalityOf({ type: f.mimetype, name: f.originalname }), name: safeFileName(f.originalname), mime: f.mimetype, size: f.size, tmpPath: f.path,
    })),
    ...links.map((l) => ({
      id: uuidv7(), kind: 'video', name: (l.title || `YouTube video ${l.id}`).slice(0, 200), mime: 'text/uri-list', size: 0, url: `https://www.youtube.com/watch?v=${l.id}`,
    })),
  ]
  if (!inputs.length && !instructions.trim()) throw invalid('Add at least one input: a file, a recording or some text.')

  const stored = []
  try {
    for (const inp of inputs) {
      if (!inp.tmpPath) continue
      inp.storageKey = `ws/${wsId}/jobs/${jobId}/${inp.id}-${inp.name}`
      await storage.put(inp.storageKey, inp.tmpPath)
      stored.push(inp.storageKey)
    }

    await db.withWorkspace({ workspaceId: wsId, userId: ctx.user.id }, async (q) => {
      // lock the workspace row so two simultaneous captures cannot both slip under the limit
      const ws = await q.one('select * from app.workspaces where id = $1 for update', [wsId])
      const u = await usage(q, ws)
      if (u.used >= u.limit) {
        throw new HttpError(429, 'quota_exceeded', `You have used all ${u.limit} documents for today on the ${u.plan} plan. Upgrade, or wait until midnight India time.`)
      }
      const template = await q.one('select id, name, accepts from app.templates where id = $1 and deleted_at is null', [templateId])
      if (!template) throw invalid('That template no longer exists.', { templateId: 'Pick another template.' })
      const refused = inputs.filter((i) => !template.accepts.includes(i.kind))
      if (refused.length) {
        throw invalid(`${template.name} does not take ${[...new Set(refused.map((i) => MODALITIES[i.kind].label.toLowerCase()))].join(' or ')} inputs.`)
      }

      await q.query(
        'insert into app.jobs (id, workspace_id, template_id, created_by, instructions) values ($1, $2, $3, $4, $5)',
        [jobId, wsId, templateId, ctx.user.id, instructions.slice(0, 4000)],
      )
      for (const [position, i] of inputs.entries()) {
        await q.query(
          `insert into app.job_inputs (id, job_id, workspace_id, position, kind, name, mime, size_bytes, storage_key, text_content, source_url)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [i.id, jobId, wsId, position, i.kind, i.name, i.mime, i.size, i.storageKey || null, i.text ?? null, i.url || null],
        )
      }
      for (const [position, s] of PIPELINE_STAGES.entries()) {
        await q.query('insert into app.job_stages (job_id, workspace_id, stage, position) values ($1, $2, $3, $4)', [jobId, wsId, s.key, position])
      }
      await audit(q, { workspaceId: wsId, actorId: ctx.user.id, action: 'job.created', detail: `${template.name}, ${inputs.length} input(s)`, meta: { jobId } })
    })
  } catch (e) {
    await Promise.all(stored.map((k) => storage.remove(k).catch(() => {})))
    throw e
  }

  events.emit('job:queued')
  return db.withWorkspace({ workspaceId: wsId, userId: ctx.user.id }, (q) => getJob(q, jobId))
}

export async function getJob(q, id) {
  const job = await q.one(
    'select j.*, t.name as template_name from app.jobs j join app.templates t on t.id = j.template_id where j.id = $1',
    [id],
  )
  if (!job) throw notFound('This job does not exist in your workspace.')
  const [inputs, stages] = await Promise.all([
    q.query('select * from app.job_inputs where job_id = $1 order by position', [id]),
    q.query('select * from app.job_stages where job_id = $1 order by position', [id]),
  ])
  return jobOut(job, inputs, stages)
}

export async function listJobs(q, { limit = 10, status } = {}) {
  const jobs = await q.query(
    `select j.*, t.name as template_name from app.jobs j join app.templates t on t.id = j.template_id
      where ($1::text is null or j.status = $1) order by j.created_at desc limit $2`,
    [status || null, Math.min(limit, 50)],
  )
  if (!jobs.length) return []
  const ids = jobs.map((j) => j.id)
  const [inputs, stages] = await Promise.all([
    q.query('select * from app.job_inputs where job_id = any($1::uuid[]) order by position', [ids]),
    q.query('select * from app.job_stages where job_id = any($1::uuid[]) order by position', [ids]),
  ])
  return jobs.map((j) => jobOut(j, inputs.filter((i) => i.job_id === j.id), stages.filter((s) => s.job_id === j.id)))
}
