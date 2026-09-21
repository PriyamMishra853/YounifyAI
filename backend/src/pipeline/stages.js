import { MODALITIES, computeDerived, normalizeContent, validateDocument } from '@younifyai/shared'
import { uuidv7 } from '../lib/util.js'
import { audit } from '../services/audit.js'
import { getTemplateRow } from '../services/templates.js'
import { sourcesForTemplate } from '../services/sources.js'

/** A failure whose message is shown to the person on the job page. */
export class PipelineError extends Error {}

const MAX_TEXT = 60_000

function normalizeText(s) {
  return String(s)
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((l) => l.trim()).join('\n')
    .trim()
}

function detectLanguage(text) {
  if (/[ऀ-ॿ]/.test(text)) return 'hi'
  const hinglish = (text.toLowerCase().match(/\b(aur|hai|ka|ki|ke|kilo|litre|chawal|tel|do|ek|teen|paanch|bhi|nahi|kya)\b/g) || []).length
  return hinglish >= 2 ? 'hi-en' : 'en'
}

async function retrieve(W, ai, templateId, query, k = 4) {
  const [vector] = await ai.embed([query.slice(0, 4000)])
  return W((q) => q.query(
    `select c.content, s.title, 1 - (c.embedding <=> $2::vector) as score
       from app.source_chunks c join app.sources s on s.id = c.source_id
      where (s.template_id is null or s.template_id = $1) and c.embed_model = $4
      order by c.embedding <=> $2::vector
      limit $3`,
    [templateId, `[${vector.join(',')}]`, k, ai.models.embed],
  ))
}

/**
 * The seven stages. Each gets { job, template, inputs, state, log, W, ai, storage }
 * and returns nothing (done) or 'skipped'. State flows forward through `state`.
 */
export const STAGES = [
  {
    key: 'capture',
    async run({ inputs, storage, log }) {
      const kinds = [...new Set(inputs.map((i) => MODALITIES[i.kind].label.toLowerCase()))]
      log(`Received ${inputs.length} input${inputs.length === 1 ? '' : 's'}: ${kinds.join(', ') || 'instructions only'}`)
      for (const i of inputs) {
        if (i.storage_key && !(await storage.exists(i.storage_key))) throw new PipelineError(`${i.name} is missing from storage. Upload it again.`)
      }
    },
  },
  {
    key: 'extract',
    async run({ job, inputs, ai, storage, log, W, state }) {
      state.texts = []
      for (const input of inputs) {
        const out = await ai.extract(input, { readFile: () => storage.read(input.storage_key), localPath: input.storage_key ? storage.localPath(input.storage_key) : null })
        const text = normalizeText(out.text || '')
        if (text) {
          state.texts.push({ name: input.name, kind: input.kind, text })
          log(`${input.name}: ${text.length.toLocaleString('en-IN')} characters via ${out.engine}`)
        } else log(out.note || `${input.name}: no readable content`)
        await W((q) => q.query('update app.job_inputs set extracted_text = $2, meta = meta || $3::jsonb where id = $1', [input.id, text, JSON.stringify({ engine: out.engine, ...(out.meta || {}) })]))
      }
      if (!state.texts.length && !job.instructions.trim()) {
        throw new PipelineError(
          ai.name === 'offline'
            ? 'Nothing readable in these inputs. Voice, video and images need an AI provider: add GROQ_API_KEY to backend/.env and restart the server. Pasted text and .txt files work without one.'
            : 'Nothing readable was found in these inputs.',
        )
      }
    },
  },
  {
    key: 'normalize',
    async run({ state, log }) {
      const merged = state.texts.map((t) => (state.texts.length > 1 ? `[${t.name}]\n${t.text}` : t.text)).join('\n\n')
      state.text = merged.slice(0, MAX_TEXT)
      state.language = detectLanguage(state.text)
      const lines = state.text.split('\n').filter(Boolean).length
      log(`Cleaned ${state.text.length.toLocaleString('en-IN')} characters in ${lines} line${lines === 1 ? '' : 's'}`)
      log(`Language: ${state.language}`)
      if (merged.length > MAX_TEXT) log(`Trimmed to the first ${MAX_TEXT.toLocaleString('en-IN')} characters`)
    },
  },
  {
    key: 'retrieve',
    async run({ job, template, ai, W, log, state }) {
      const sources = await W((q) => sourcesForTemplate(q, template.id))
      state.sources = sources.map((s) => s.text_content.slice(0, 20_000))
      if (!sources.length) {
        log('No reference material for this template')
        state.context = []
        return 'skipped'
      }
      state.context = await retrieve(W, ai, template.id, `${job.instructions}\n${state.text}`)
      for (const c of state.context) log(`Matched ${c.title} (${Number(c.score).toFixed(2)})`)
    },
  },
  {
    key: 'generate',
    async run({ job, template, ai, log, state }) {
      const out = await ai.generate({
        template, text: state.text, context: state.context, sources: state.sources,
        instructions: job.instructions, language: state.language, now: new Date(),
      })
      state.content = computeDerived(template, normalizeContent(template, out.content))
      state.engine = out.engine
      const filled = template.fields.filter((f) => {
        const v = state.content[f.key]
        return Array.isArray(v) ? v.length : v != null && v !== ''
      }).length
      log(`Filled ${filled} of ${template.fields.length} fields with ${out.model} (${out.engine})`)
    },
  },
  {
    key: 'validate',
    async run({ template, log, state }) {
      const { issues } = validateDocument(template, state.content)
      state.issues = issues
      const errors = issues.filter((i) => i.level === 'error').length
      log(issues.length ? `${errors} error${errors === 1 ? '' : 's'}, ${issues.length - errors} warning${issues.length - errors === 1 ? '' : 's'} for review` : 'All checks pass')
      for (const i of issues.slice(0, 5)) log(`${i.level}: ${i.message}`)
    },
  },
  {
    key: 'deliver',
    async run({ job, template, inputs, W, log, state }) {
      const docId = await W(async (q) => {
        // idempotent: a re-run after a crash must not create a second document
        const existing = await q.one('select document_id from app.jobs where id = $1', [job.id])
        if (existing?.document_id) return existing.document_id
        const id = uuidv7()
        const c = state.content
        const title = c.title || (c.bill_no ? `${template.name} #${c.bill_no}` : template.name)
        const inputSummary = inputs.map((i) => ({ kind: i.kind, name: i.name, size: Number(i.size_bytes) }))
        await q.query(
          `insert into app.documents (id, workspace_id, template_id, job_id, title, content, inputs, engine, created_by)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
          [id, job.workspace_id, template.id, job.id, title, JSON.stringify(c), JSON.stringify(inputSummary), state.engine, job.created_by],
        )
        await q.query(
          `insert into app.document_versions (id, document_id, workspace_id, version, title, content, note)
           values ($1, $2, $3, 1, $4, $5::jsonb, 'Generated')`,
          [uuidv7(), id, job.workspace_id, title, JSON.stringify(c)],
        )
        await q.query('update app.jobs set document_id = $2 where id = $1', [job.id, id])
        await audit(q, { workspaceId: job.workspace_id, documentId: id, action: 'document.generated', detail: `${template.name} from ${inputs.length} input(s)`, meta: { jobId: job.id, engine: state.engine } })
        return id
      })
      state.documentId = docId
      log('Draft saved for review')
    },
  },
]

/** Run every stage for a claimed job, recording status and logs as it goes. */
export async function runPipeline(deps, job) {
  const { db, events } = deps
  const W = (fn) => db.withWorkspace({ workspaceId: job.workspace_id, userId: job.created_by }, fn)
  const { template, inputs } = await W(async (q) => ({
    template: await getTemplateRow(q, job.template_id),
    inputs: await q.query('select * from app.job_inputs where job_id = $1 order by position', [job.id]),
  }))
  const state = {}
  const emit = () => events.emit(`job:${job.id}`)

  for (const stage of STAGES) {
    const lines = []
    const log = (line) => lines.push(String(line))
    await W(async (q) => {
      await q.query(`update app.job_stages set status = 'running', started_at = now(), finished_at = null, log = '[]' where job_id = $1 and stage = $2`, [job.id, stage.key])
      await q.query('update app.jobs set locked_at = now() where id = $1', [job.id]) // heartbeat
    })
    emit()
    let status = 'done'
    try {
      if ((await stage.run({ ...deps, job, template, inputs, state, log, W })) === 'skipped') status = 'skipped'
    } catch (e) {
      lines.push(e instanceof PipelineError ? e.message : 'This step failed unexpectedly.')
      await W((q) => q.query(`update app.job_stages set status = 'failed', finished_at = now(), log = $3::jsonb where job_id = $1 and stage = $2`, [job.id, stage.key, JSON.stringify(lines)]))
      emit()
      throw e
    }
    await W((q) => q.query(`update app.job_stages set status = $3, finished_at = now(), log = $4::jsonb where job_id = $1 and stage = $2`, [job.id, stage.key, status, JSON.stringify(lines)]))
    emit()
  }

  await W((q) => q.query(`update app.jobs set status = 'succeeded', finished_at = now(), locked_by = null, error = null where id = $1`, [job.id]))
  emit()
  return state
}
