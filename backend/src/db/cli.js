import pino from 'pino'
import { loadConfig } from '../config.js'
import { createDb, migrate } from './index.js'
import { seedSystemTemplates } from './seed.js'

// node src/db/cli.js migrate  → apply pending migrations and upsert system templates, then exit
const log = pino({ level: 'info' })
const config = loadConfig()
const db = await createDb(config, log)
await migrate(db, log)
await seedSystemTemplates(db)
log.info('database is up to date')
await db.close()
