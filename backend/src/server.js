import net from 'node:net'
import pino from 'pino'
import { createAi } from './ai/index.js'
import { createVectorStore } from './ai/vectors.js'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createDb, migrate } from './db/index.js'
import { seedSystemTemplates } from './db/seed.js'
import { createEvents } from './events.js'
import { createWorker } from './pipeline/worker.js'
import { createLocalStorage } from './storage.js'

/** Wire every dependency once. Exported so scripts and tests can boot the same stack. */
export async function boot(config = loadConfig(), { log = pino({ level: config.logLevel }) } = {}) {
  const db = await createDb(config, log)
  await migrate(db, log)
  await seedSystemTemplates(db)
  const storage = createLocalStorage(config.storageDir)
  await storage.init()
  const ai = await createAi(config, log)
  const vectors = createVectorStore(config, log)
  const events = createEvents()
  const deps = { config, log, db, storage, ai, vectors, events }
  const worker = createWorker(deps)
  const app = createApp(deps)
  return { ...deps, app, worker }
}

/** Resolves false when something is already listening on the port. */
function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen(port, '0.0.0.0')
  })
}

/** Start the HTTP server and the pipeline worker; stop both cleanly on SIGINT/SIGTERM. */
export async function startServer(config = loadConfig()) {
  const log = pino({ level: config.logLevel })
  // Checked before the database is opened: two servers sharing one PGlite folder
  // corrupt it, and this is the only way that happens in practice.
  if (!(await portFree(config.port))) {
    log.error({ port: config.port }, `YounifyAI is already running on port ${config.port}. Stop it first, or set PORT to something else.`)
    process.exit(1)
  }
  const stack = await boot(config, { log })
  if (config.runWorker) await stack.worker.start()
  const server = stack.app.listen(config.port, () => log.info({ port: config.port }, `YounifyAI API listening on http://localhost:${config.port}`))

  let closing = false
  const shutdown = async (signal) => {
    if (closing) return
    closing = true
    log.info({ signal }, 'shutting down')
    server.close()
    await stack.worker.stop()
    await stack.db.close()
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  return { ...stack, server }
}
