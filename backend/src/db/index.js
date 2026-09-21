import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// One interface over two drivers:
//   PGlite  — Postgres compiled to WASM, in-process, for local development and tests
//   pg      — node-postgres pool, for Supabase or any hosted Postgres (DATABASE_URL)
//
//   db.query(sql, params)  → rows           (connection role; for identity tables and system work)
//   db.one(sql, params)    → row | null
//   db.tx(fn)              → fn(q) in a transaction (connection role)
//   db.withWorkspace(ctx, fn)
//       → fn(q) in a transaction running as app_user with app.workspace_id / app.user_id set,
//         so row-level security confines every statement to that workspace.
//   q.query / q.one        → same as above, bound to the transaction

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

function wrap(runner) {
  return {
    query: async (sql, params = []) => (await runner(sql, params)).rows,
    one: async (sql, params = []) => (await runner(sql, params)).rows[0] ?? null,
  }
}

async function scoped(q, { workspaceId, userId }) {
  await q.query('set local role app_user')
  await q.query("select set_config('app.workspace_id', $1, true), set_config('app.user_id', $2, true)", [
    workspaceId ? String(workspaceId) : '',
    userId ? String(userId) : '',
  ])
}

async function createPglite(dir) {
  const { PGlite } = await import('@electric-sql/pglite')
  const { vector } = await import('@electric-sql/pglite-pgvector')
  if (dir) await fs.mkdir(dir, { recursive: true })
  const pg = await PGlite.create({ dataDir: dir || undefined, extensions: { vector } })
  const base = wrap((sql, params) => pg.query(sql, params))
  return {
    kind: 'pglite',
    ...base,
    exec: (sql) => pg.exec(sql),
    tx: (fn) => pg.transaction((tx) => fn(wrap((sql, params) => tx.query(sql, params)))),
    withWorkspace: (ctx, fn) =>
      pg.transaction(async (tx) => {
        const q = wrap((sql, params) => tx.query(sql, params))
        await scoped(q, ctx)
        return fn(q)
      }),
    execInTx: (sql) => pg.transaction((tx) => tx.exec(sql)),
    close: () => pg.close(),
  }
}

async function createPostgres(url) {
  const { default: pgLib } = await import('pg')
  // timestamps come back as Date, bigint counts as numbers (we never exceed 2^53 rows)
  pgLib.types.setTypeParser(20, (v) => Number(v))
  const pool = new pgLib.Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  })
  const inTx = async (fn, ctx) => {
    const client = await pool.connect()
    try {
      await client.query('begin')
      const q = wrap((sql, params) => client.query(sql, params))
      if (ctx) await scoped(q, ctx)
      const out = await fn(q)
      await client.query('commit')
      return out
    } catch (e) {
      await client.query('rollback').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  }
  return {
    kind: 'postgres',
    ...wrap((sql, params) => pool.query(sql, params)),
    exec: (sql) => pool.query(sql),
    tx: (fn) => inTx(fn),
    withWorkspace: (ctx, fn) => inTx(fn, ctx),
    execInTx: (sql) => inTx((q) => q.query(sql)),
    close: () => pool.end(),
  }
}

export async function createDb(config, log) {
  const db = config.databaseUrl ? await createPostgres(config.databaseUrl) : await createPglite(config.pgliteDir)
  log?.info({ driver: db.kind, dir: db.kind === 'pglite' ? config.pgliteDir || 'memory' : undefined }, 'database connected')
  return db
}

/** Apply every migration in src/db/migrations that has not run yet, in file-name order. */
export async function migrate(db, log) {
  await db.exec('create schema if not exists app; create table if not exists app.schema_migrations (name text primary key, applied_at timestamptz not null default now())')
  const done = new Set((await db.query('select name from app.schema_migrations')).map((r) => r.name))
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    if (done.has(f)) continue
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, f), 'utf8')
    await db.execInTx(`${sql}\ninsert into app.schema_migrations (name) values ('${f.replace(/'/g, "''")}');`)
    log?.info({ migration: f }, 'migration applied')
  }
}
