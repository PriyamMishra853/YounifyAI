import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { authenticate, errorHandler, originGuard } from './middleware.js'
import { apiRouter } from './routes.js'

/** Build the Express app from its dependencies. Tests call this with an in-memory database. */
export function createApp(deps) {
  const { config, log } = deps
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use(pinoHttp({
    logger: log,
    genReqId: (req, res) => {
      const id = req.get('x-request-id') || crypto.randomUUID()
      res.set('x-request-id', id)
      return id
    },
    autoLogging: { ignore: (req) => req.url === '/api/health' || req.url.endsWith('/events') },
    customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    serializers: { req: (req) => ({ id: req.id, method: req.method, url: req.url }), res: (res) => ({ status: res.statusCode }) },
  }))

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }))

  app.use(express.json({ limit: '2mb' }))
  app.use(cookieParser())
  app.use('/api', originGuard(config), authenticate(deps), apiRouter(deps))

  // production: one process serves the built frontend as well
  if (config.serveFrontend && fs.existsSync(config.frontendDist)) {
    app.use(express.static(config.frontendDist, { index: false, maxAge: '1h', immutable: false }))
    app.use('/assets', express.static(path.join(config.frontendDist, 'assets'), { maxAge: '1y', immutable: true }))
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(config.frontendDist, 'index.html')))
  }

  app.use(errorHandler(log))
  return app
}
