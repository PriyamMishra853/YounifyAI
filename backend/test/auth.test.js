import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { signedIn, startStack } from './helpers.js'

let stack
before(async () => { stack = await startStack() })
after(async () => { await stack.stop() })

test('health reports the database and AI provider', async () => {
  const res = await stack.agent().get('/api/health')
  assert.equal(res.status, 200)
  assert.equal(res.body.database, 'pglite')
  assert.equal(res.body.ai.provider, 'offline')
})

test('signup creates a user, an owned workspace with samples, and a session cookie', async () => {
  const { agent, session } = await signedIn(stack, { name: 'Asha Verma' })
  assert.equal(session.role, 'owner')
  assert.equal(session.workspace.name, 'Asha’s workspace')
  assert.equal(session.workspace.plan, 'free')
  const me = await agent.get('/api/auth/me')
  assert.equal(me.body.user.name, 'Asha Verma')
  const docs = await agent.get('/api/documents')
  assert.equal(docs.body.length, 3)
  assert.ok(docs.body.every((d) => d.sample))
  const sources = await agent.get('/api/sources')
  assert.equal(sources.body[0].title, 'Store price list')
})

test('session cookie is httpOnly and SameSite=Lax', async () => {
  const res = await stack.agent().post('/api/auth/signup').send({ name: 'C', email: `cookie${Date.now()}@example.com`, password: 'longenough1' })
  const cookie = res.headers['set-cookie'].join(';')
  assert.match(cookie, /yf_session=/)
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=Lax/i)
})

test('signup validates fields and rejects a taken email', async () => {
  const bad = await stack.agent().post('/api/auth/signup').send({ name: '', email: 'nope', password: 'short' })
  assert.equal(bad.status, 422)
  assert.ok(bad.body.error.fields.name && bad.body.error.fields.email && bad.body.error.fields.password)
  const { credentials } = await signedIn(stack)
  const dup = await stack.agent().post('/api/auth/signup').send(credentials)
  assert.equal(dup.status, 409)
  assert.equal(dup.body.error.code, 'email_taken')
})

test('login accepts the right password, rejects a wrong one, logout ends the session', async () => {
  const { credentials } = await signedIn(stack)
  const agent = stack.agent()
  const wrong = await agent.post('/api/auth/login').send({ email: credentials.email, password: 'wrong-password' })
  assert.equal(wrong.status, 401)
  const ok = await agent.post('/api/auth/login').send({ email: credentials.email.toUpperCase(), password: credentials.password })
  assert.equal(ok.status, 200)
  assert.equal((await agent.get('/api/documents')).status, 200)
  assert.equal((await agent.post('/api/auth/logout')).status, 204)
  assert.equal((await agent.get('/api/documents')).status, 401)
})

test('writes from a foreign origin are refused', async () => {
  const { agent } = await signedIn(stack)
  const res = await agent.patch('/api/me').set('Origin', 'https://evil.example').send({ name: 'x' })
  assert.equal(res.status, 403)
  const ok = await agent.patch('/api/me').set('Origin', 'http://localhost:5173').send({ name: 'Renamed' })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.name, 'Renamed')
})
