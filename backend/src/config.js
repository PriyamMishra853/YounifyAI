import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const BACKEND_ROOT = path.resolve(here, '..')

const bool = (v, d = false) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(v))
const int = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v))

/** All configuration comes from the environment. See backend/.env.example. */
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  const dataDir = path.resolve(BACKEND_ROOT, env.DATA_DIR || 'data')
  return {
    production,
    port: int(env.PORT, 8787),
    logLevel: env.LOG_LEVEL || (production ? 'info' : 'debug'),

    // database: DATABASE_URL (Supabase / Postgres) wins; otherwise embedded PGlite on disk
    databaseUrl: env.DATABASE_URL || null,
    pgliteDir: env.PGLITE_DIR === 'memory' ? null : path.resolve(dataDir, env.PGLITE_DIR || 'pg'),

    storageDir: path.resolve(BACKEND_ROOT, env.STORAGE_DIR || 'storage'),

    // the browser origin(s) allowed to call the API with cookies
    appOrigins: (env.APP_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((s) => s.trim()).filter(Boolean),
    cookieSecure: bool(env.COOKIE_SECURE, production),
    sessionDays: int(env.SESSION_DAYS, 30),

    workerConcurrency: int(env.WORKER_CONCURRENCY, 2),
    workerPollMs: int(env.WORKER_POLL_MS, 400),
    runWorker: bool(env.RUN_WORKER, true),

    maxUploadMb: int(env.MAX_UPLOAD_MB, 500),
    serveFrontend: bool(env.SERVE_FRONTEND, production),
    frontendDist: path.resolve(BACKEND_ROOT, '..', 'frontend', 'dist'),

    ai: {
      provider: (env.AI_PROVIDER || 'auto').toLowerCase(), // auto | groq | openai | offline
      groqApiKey: env.GROQ_API_KEY || null,
      openaiApiKey: env.OPENAI_API_KEY || null,
      chatModel: env.AI_CHAT_MODEL || null,
      visionModel: env.AI_VISION_MODEL || null,
      transcribeModel: env.AI_TRANSCRIBE_MODEL || null,
      qdrantUrl: env.QDRANT_URL || null,
      qdrantApiKey: env.QDRANT_API_KEY || null,
    },
  }
}
