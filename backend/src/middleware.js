import crypto from 'node:crypto'
import multer from 'multer'
import { ZodError } from 'zod'
import { forbidden, HttpError, invalid, unauthenticated } from './lib/errors.js'
import { resolveSession } from './services/auth.js'

export const SESSION_COOKIE = 'yf_session'

export function cookieOptions(config) {
  return { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/', maxAge: config.sessionDays * 24 * 60 * 60 * 1000 }
}

/**
 * Cookies are SameSite=Lax, which already stops cross-site form posts. As a second
 * layer, writes must come from an allowed origin (or carry no Origin header,
 * as same-origin fetches from older browsers and server-to-server calls do).
 */
export function originGuard(config) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
    const origin = req.get('origin')
    if (!origin) return next()
    const self = `${req.protocol}://${req.get('host')}`
    if (origin === self || config.appOrigins.includes(origin)) return next()
    next(forbidden('This request came from a site that is not allowed to use this API.'))
  }
}

/** Loads the session (if any) into req.ctx = { sessionId, user, workspace, role }. */
export function authenticate({ db, config }) {
  return async (req, res, next) => {
    try {
      req.ctx = await resolveSession(db, config, req.cookies?.[SESSION_COOKIE])
      if (!req.ctx && req.cookies?.[SESSION_COOKIE]) res.clearCookie(SESSION_COOKIE, { path: '/' })
      next()
    } catch (e) {
      next(e)
    }
  }
}

export function requireAuth(req, res, next) {
  if (!req.ctx) return next(unauthenticated())
  if (!req.ctx.workspace) return next(forbidden('You are not a member of any workspace. Ask an owner to invite you again.'))
  next()
}

/** requireRole('owner', 'editor') */
export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.ctx?.role)) return next(forbidden())
  next()
}

/** Run fn(q) in a transaction confined to the request's workspace by row-level security. */
export const inWorkspace = (db, req, fn) => db.withWorkspace({ workspaceId: req.ctx.workspace.id, userId: req.ctx.user.id }, fn)

/** Parse with zod; field errors become a 422 the forms can show next to each input. */
export function parse(schema, data) {
  const r = schema.safeParse(data)
  if (r.success) return r.data
  const fields = {}
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || 'form'
    fields[key] ||= issue.message
  }
  throw invalid(Object.values(fields)[0] || 'Check the highlighted fields.', fields)
}

export function uploader(config, storage, { maxFiles = 10, maxMb = config.maxUploadMb } = {}) {
  return multer({
    storage: multer.diskStorage({
      destination: storage.tmpDir,
      filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: maxFiles, fields: 20, fieldSize: 2 * 1024 * 1024 },
  })
}

export function errorHandler(log) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } })
    }
    if (err instanceof ZodError) return res.status(422).json({ error: { code: 'invalid', message: 'Check the highlighted fields.' } })
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'A file is larger than the upload limit.' : err.code === 'LIMIT_FILE_COUNT' ? 'Too many files in one capture.' : 'The upload could not be read.'
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: { code: 'upload', message } })
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'bad_json', message: 'The request body is not valid JSON.' } })
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: { code: 'too_large', message: 'The request is too large.' } })
    ;(req.log || log).error({ err }, 'unhandled error')
    res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong on our side. Try again.', requestId: req.id } })
  }
}
