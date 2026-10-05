import fs from 'node:fs/promises'
import express from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { PLANS, ROLES, planById } from '@younifyai/shared'
import { invalid, notFound } from './lib/errors.js'
import { safeFileName, uuidv7 } from './lib/util.js'
import {
  SESSION_COOKIE, cookieOptions, inWorkspace, parse, requireAuth, requireRole, uploader,
} from './middleware.js'
import * as auth from './services/auth.js'
import * as workspaces from './services/workspaces.js'
import * as templates from './services/templates.js'
import * as sources from './services/sources.js'
import * as jobs from './services/jobs.js'
import * as documents from './services/documents.js'
import { audit, listAudit } from './services/audit.js'
import { renderExport } from './services/exports.js'
import { LinkError, youtubeId, youtubeInfo } from './ai/youtube.js'

const email = z.string().trim().toLowerCase().email('Enter a valid email address.')
const signupBody = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(80),
  email,
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
})
const loginBody = z.object({ email: z.string().min(1, 'Enter your email.'), password: z.string().min(1, 'Enter your password.') })
const nameBody = z.object({ name: z.string().trim().min(1, 'Enter a name.').max(80) })
const uuid = z.string().uuid('Not a valid id.')
const roleEnum = z.enum(Object.keys(ROLES))

const EDIT = requireRole('owner', 'editor')
const OWNER = requireRole('owner')

export function apiRouter(deps) {
  const { db, config, storage, events, ai, vectors } = deps
  const r = express.Router()
  const W = (req, fn) => inWorkspace(db, req, fn)
  const meta = (req) => ({ userAgent: req.get('user-agent'), ip: req.ip })
  const setSession = (res, token) => res.cookie(SESSION_COOKIE, token, cookieOptions(config))
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.production ? 20 : 200, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'rate_limited', message: 'Too many attempts. Wait a few minutes and try again.' } } })

  /* ------------------------------------------------------------ health */

  r.get('/health', async (req, res) => {
    await db.one('select 1')
    res.json({ ok: true, database: db.kind, ai: { provider: ai.name, models: ai.models }, time: new Date().toISOString() })
  })

  /* -------------------------------------------------------------- auth */

  r.post('/auth/signup', authLimiter, async (req, res) => {
    const body = parse(signupBody, req.body)
    const { token } = await auth.signup(deps, body, meta(req))
    setSession(res, token)
    res.status(201).json(await auth.resolveSession(db, config, token).then(publicSession))
  })

  r.post('/auth/login', authLimiter, async (req, res) => {
    const body = parse(loginBody, req.body)
    const { token } = await auth.login(db, config, body, meta(req))
    setSession(res, token)
    res.json(await auth.resolveSession(db, config, token).then(publicSession))
  })

  r.post('/auth/logout', async (req, res) => {
    await auth.logout(db, req.cookies?.[SESSION_COOKIE])
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    res.status(204).end()
  })

  r.get('/auth/me', (req, res) => res.json(req.ctx ? publicSession(req.ctx) : null))

  /* ------------------------------------------------------------- account */

  r.patch('/me', requireAuth, async (req, res) => {
    res.json(await auth.updateProfile(db, req.ctx.user.id, parse(nameBody, req.body)))
  })

  r.get('/workspaces', requireAuth, async (req, res) => res.json(await workspaces.listMine(db, req.ctx.user.id)))

  r.post('/workspaces/switch', requireAuth, async (req, res) => {
    const { workspaceId } = parse(z.object({ workspaceId: uuid }), req.body)
    await workspaces.switchWorkspace(db, req.ctx, workspaceId)
    res.json(publicSession(await auth.resolveSession(db, config, req.cookies[SESSION_COOKIE])))
  })

  r.patch('/workspace', requireAuth, OWNER, async (req, res) => {
    const { name } = parse(nameBody, req.body)
    res.json(await W(req, (q) => workspaces.rename(q, req.ctx, name)))
  })

  r.get('/workspace/usage', requireAuth, async (req, res) => res.json(await W(req, (q) => workspaces.usage(q, req.ctx.workspace))))

  r.put('/workspace/plan', requireAuth, OWNER, async (req, res) => {
    const { plan } = parse(z.object({ plan: z.enum(PLANS.map((p) => p.id)) }), req.body)
    res.json(await W(req, (q) => workspaces.changePlan(q, req.ctx, plan)))
  })

  r.get('/workspace/members', requireAuth, async (req, res) => res.json(await W(req, (q) => workspaces.listMembers(q))))

  r.post('/workspace/members', requireAuth, OWNER, async (req, res) => {
    const body = parse(z.object({ email, role: roleEnum }), req.body)
    const existing = await db.one('select id from app.users where email = $1', [body.email])
    res.status(201).json(await W(req, (q) => workspaces.invite(q, req.ctx, { ...body, existingUserId: existing?.id })))
  })

  r.patch('/workspace/members/:id', requireAuth, OWNER, async (req, res) => {
    const { role } = parse(z.object({ role: roleEnum }), req.body)
    res.json(await W(req, (q) => workspaces.updateRole(q, req.ctx, parse(uuid, req.params.id), role)))
  })

  r.delete('/workspace/members/:id', requireAuth, OWNER, async (req, res) => {
    await W(req, (q) => workspaces.removeMember(q, req.ctx, parse(uuid, req.params.id)))
    res.status(204).end()
  })

  /* ------------------------------------------------------------ overview */

  r.get('/overview', requireAuth, async (req, res) => {
    res.json(await W(req, async (q) => {
      const base = await documents.overview(q, await workspaces.usage(q, req.ctx.workspace))
      return { ...base, running: [...(await jobs.listJobs(q, { status: 'running' })), ...(await jobs.listJobs(q, { status: 'queued' }))] }
    }))
  })

  r.get('/audit', requireAuth, async (req, res) => {
    const documentId = req.query.documentId ? parse(uuid, req.query.documentId) : null
    res.json(await W(req, (q) => listAudit(q, { documentId })))
  })

  /* ----------------------------------------------------------- templates */

  r.get('/templates', requireAuth, async (req, res) => res.json(await W(req, (q) => templates.listTemplates(q))))

  r.post('/templates', requireAuth, EDIT, async (req, res) => {
    const input = parse(templates.templateInput, req.body)
    res.status(201).json(await W(req, (q) => templates.createTemplate(q, req.ctx, input)))
  })

  r.patch('/templates/:id', requireAuth, EDIT, async (req, res) => {
    const input = parse(templates.templateInput, req.body)
    res.json(await W(req, (q) => templates.updateTemplate(q, req.ctx, req.params.id, input)))
  })

  r.delete('/templates/:id', requireAuth, EDIT, async (req, res) => {
    await W(req, (q) => templates.deleteTemplate(q, req.ctx, req.params.id))
    res.status(204).end()
  })

  /* ------------------------------------------------------------- sources */

  r.get('/sources', requireAuth, async (req, res) => res.json(await W(req, (q) => sources.listSources(q))))

  const sourceUpload = uploader(config, storage, { maxFiles: 1, maxMb: 20 })
  r.post('/sources', requireAuth, EDIT, sourceUpload.single('file'), async (req, res) => {
    const body = parse(z.object({
      title: z.string().trim().min(1, 'Name this source.').max(120),
      templateId: z.string().trim().max(80).optional().default(''),
      text: z.string().max(500_000).optional().default(''),
    }), req.body)
    let text = body.text
    let storageKey = null
    if (req.file) {
      const id = uuidv7()
      storageKey = `ws/${req.ctx.workspace.id}/sources/${id}-${safeFileName(req.file.originalname)}`
      await storage.put(storageKey, req.file.path)
      const out = await ai.extract(
        { name: req.file.originalname, mime: req.file.mimetype, kind: 'docs', storage_key: storageKey },
        { readFile: () => storage.read(storageKey), localPath: storage.localPath(storageKey) },
      )
      text = out.text
      if (!text?.trim()) {
        await storage.remove(storageKey)
        throw invalid(out.note || 'No readable text in that file.', { file: 'Use a .txt, .md, .csv, .pdf or .docx file.' })
      }
    }
    const source = await W(req, (q) => sources.addSource(q, req.ctx, {
      title: body.title, templateId: body.templateId || null, text, kind: req.file ? 'file' : 'text', mime: req.file?.mimetype, storageKey,
    }, { ai, vectorStore: vectors }))
    res.status(201).json(source)
  })

  r.delete('/sources/:id', requireAuth, EDIT, async (req, res) => {
    const id = parse(uuid, req.params.id)
    const s = await W(req, (q) => sources.deleteSource(q, req.ctx, id))
    if (s.storage_key) await storage.remove(s.storage_key).catch(() => {})
    await vectors.removeSource(id).catch((e) => req.log.warn({ err: e.message }, 'vector cleanup failed'))
    res.status(204).end()
  })

  /* ---------------------------------------------------------------- jobs */

  const jobUpload = uploader(config, storage)
  r.post('/jobs', requireAuth, EDIT, jobUpload.array('files', 10), async (req, res) => {
    try {
      const body = parse(z.object({
        templateId: z.string().trim().min(1, 'Pick a template.'),
        instructions: z.string().max(4000).optional().default(''),
        texts: z.string().optional().default('[]'),
        links: z.string().optional().default('[]'),
      }), req.body)
      let links
      try {
        links = z.array(z.object({ url: z.string().max(500), title: z.string().max(300).optional() })).max(5).parse(JSON.parse(body.links))
      } catch {
        throw invalid('Links could not be read.')
      }
      links = links.map((l) => ({ ...l, id: youtubeId(l.url) }))
      if (links.some((l) => !l.id)) throw invalid('Only YouTube video links are supported.', { links: 'Paste a youtube.com or youtu.be video link.' })
      let texts
      try {
        texts = z.array(z.object({ name: z.string().max(120).optional(), text: z.string().max(200_000) })).max(10).parse(JSON.parse(body.texts))
      } catch {
        throw invalid('Pasted text could not be read.')
      }
      const job = await jobs.createJob(deps, req.ctx, { templateId: body.templateId, instructions: body.instructions, texts, links, files: req.files || [] })
      res.status(201).json(job)
    } finally {
      // anything multer left in tmp (on failure the files were never moved)
      await Promise.all((req.files || []).map((f) => fs.rm(f.path, { force: true })))
    }
  })

  /** Look up a YouTube link before capturing it: title, channel, length, captions. */
  r.post('/links/preview', requireAuth, async (req, res) => {
    const { url } = parse(z.object({ url: z.string().trim().min(1, 'Paste a link.').max(500) }), req.body)
    if (!youtubeId(url)) throw invalid('That is not a YouTube video link.', { url: 'Paste a youtube.com or youtu.be video link.' })
    try {
      const info = await youtubeInfo(url)
      res.json({ ...info, description: info.description.slice(0, 300), hasCaptions: info.captions.length > 0 })
    } catch (e) {
      if (e instanceof LinkError) throw invalid(e.message, { url: e.message })
      throw invalid('YouTube could not be reached. Check the internet connection and try again.')
    }
  })

  r.get('/jobs', requireAuth, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 10, 50)
    res.json(await W(req, (q) => jobs.listJobs(q, { limit })))
  })

  r.get('/jobs/:id', requireAuth, async (req, res) => res.json(await W(req, (q) => jobs.getJob(q, parse(uuid, req.params.id)))))

  /** Server-sent events: the job's full state on every change, then `end`. */
  r.get('/jobs/:id/events', requireAuth, async (req, res) => {
    const id = parse(uuid, req.params.id)
    const first = await W(req, (q) => jobs.getJob(q, id))
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    res.flushHeaders()
    let last = ''
    let closed = false
    let pending = null
    const finish = () => {
      if (closed) return
      closed = true
      clearInterval(poll)
      clearInterval(beat)
      clearTimeout(pending)
      events.off(`job:${id}`, onEvent)
      res.end()
    }
    const push = (job) => {
      const s = JSON.stringify(job)
      if (s !== last) {
        last = s
        res.write(`event: job\ndata: ${s}\n\n`)
      }
      if (job.status === 'succeeded' || job.status === 'failed') {
        res.write('event: end\ndata: {}\n\n')
        finish()
      }
    }
    const refresh = () => W(req, (q) => jobs.getJob(q, id)).then((j) => !closed && push(j)).catch(finish)
    const onEvent = () => {
      clearTimeout(pending)
      pending = setTimeout(refresh, 40)
    }
    events.on(`job:${id}`, onEvent)
    const poll = setInterval(refresh, 1500) // other processes may be running the job
    const beat = setInterval(() => res.write(': keep-alive\n\n'), 15_000)
    req.on('close', finish)
    push(first)
  })

  /* ----------------------------------------------------------- documents */

  r.get('/documents', requireAuth, async (req, res) => {
    const f = parse(z.object({
      q: z.string().max(200).optional().default(''),
      status: z.enum(['', 'draft', 'approved']).optional().default(''),
      templateId: z.string().max(80).optional().default(''),
      sort: z.enum(['updated', 'created', 'title']).optional().default('updated'),
    }), req.query)
    res.json(await W(req, (q) => documents.listDocuments(q, f)))
  })

  r.get('/documents/:id', requireAuth, async (req, res) => res.json(await W(req, (q) => documents.getDocument(q, parse(uuid, req.params.id)))))

  r.patch('/documents/:id', requireAuth, EDIT, async (req, res) => {
    const body = parse(z.object({
      title: z.string().max(200).optional(),
      content: z.record(z.string(), z.unknown()).optional(),
      expectedVersion: z.number().int().positive().optional(),
    }), req.body)
    res.json(await W(req, (q) => documents.updateDocument(q, req.ctx, parse(uuid, req.params.id), body)))
  })

  r.post('/documents/:id/approve', requireAuth, EDIT, async (req, res) => {
    res.json(await W(req, (q) => documents.approveDocument(q, req.ctx, parse(uuid, req.params.id))))
  })

  r.get('/documents/:id/versions', requireAuth, async (req, res) => res.json(await W(req, (q) => documents.listVersions(q, parse(uuid, req.params.id)))))

  r.post('/documents/:id/versions/:versionId/restore', requireAuth, EDIT, async (req, res) => {
    res.json(await W(req, (q) => documents.restoreVersion(q, req.ctx, parse(uuid, req.params.id), parse(uuid, req.params.versionId))))
  })

  r.get('/documents/:id/export', requireAuth, async (req, res) => {
    const format = parse(z.enum(['pdf', 'docx', 'md', 'json']), req.query.format)
    const allowed = planById(req.ctx.workspace.plan).limits.exports
    if (!allowed.includes(format)) {
      return res.status(402).json({ error: { code: 'plan_required', message: `${format.toUpperCase()} export is part of the Premium and Pro plans. On Free, export PDF or Markdown.` } })
    }
    const { doc, template } = await W(req, async (q) => {
      const d = await documents.getDocument(q, parse(uuid, req.params.id))
      return { doc: d, template: d.template }
    })
    if (!template) throw notFound('The template for this document was deleted.')
    const file = await renderExport(template, doc, format)
    await W(req, (q) => audit(q, {
      workspaceId: req.ctx.workspace.id, documentId: doc.id, actorId: req.ctx.user.id, action: 'document.exported', detail: format.toUpperCase(),
    }))
    res.set({
      'Content-Type': file.mime,
      'Content-Disposition': `attachment; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'Cache-Control': 'no-store',
    })
    res.send(file.body)
  })

  r.delete('/documents/:id', requireAuth, EDIT, async (req, res) => {
    await W(req, (q) => documents.deleteDocument(q, req.ctx, parse(uuid, req.params.id)))
    res.status(204).end()
  })

  r.use((req, res) => res.status(404).json({ error: { code: 'not_found', message: `No API route for ${req.method} ${req.path}` } }))
  return r
}

function publicSession(ctx) {
  if (!ctx) return null
  return { user: ctx.user, workspace: ctx.workspace, role: ctx.role }
}
