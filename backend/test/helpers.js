import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import pino from 'pino'
import request from 'supertest'
import { loadConfig } from '../src/config.js'
import { boot } from '../src/server.js'

/**
 * A full stack on an in-memory database and a temp storage folder,
 * with the pipeline worker running and the offline AI provider.
 */
export async function startStack(env = {}) {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'younify-test-'))
  const config = loadConfig({
    NODE_ENV: 'test', PGLITE_DIR: 'memory', STORAGE_DIR: storageDir, AI_PROVIDER: 'offline',
    WORKER_POLL_MS: '50', APP_ORIGIN: 'http://localhost:5173', ...env,
  })
  const stack = await boot(config, { log: pino({ level: 'silent' }) })
  await stack.worker.start()
  return {
    ...stack,
    agent: () => request.agent(stack.app),
    async stop() {
      await stack.worker.stop(2000)
      await stack.db.close()
      await fs.rm(storageDir, { recursive: true, force: true })
    },
  }
}

let n = 0
export async function signedIn(stack, overrides = {}) {
  const agent = stack.agent()
  n += 1
  const body = { name: overrides.name || `Tester ${n}`, email: overrides.email || `tester${n}_${Date.now()}@example.com`, password: 'correct-horse-9' }
  const res = await agent.post('/api/auth/signup').send(body)
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`)
  return { agent, session: res.body, credentials: body }
}

/** Create a capture from pasted text and wait for the pipeline to finish it. */
export async function captureText(stack, agent, templateId, text, extra = {}) {
  const res = await agent
    .post('/api/jobs')
    .field('templateId', templateId)
    .field('instructions', extra.instructions || '')
    .field('texts', JSON.stringify([{ name: 'pasted.txt', text }]))
  if (res.status !== 201) return { res }
  await stack.worker.drain()
  const job = (await agent.get(`/api/jobs/${res.body.id}`)).body
  return { res, job }
}
