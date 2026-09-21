import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { signedIn, startStack } from './helpers.js'

let stack
before(async () => { stack = await startStack() })
after(async () => { await stack.stop() })

const customTemplate = {
  name: 'Site inspection',
  description: 'Walkthrough notes',
  accepts: ['voice', 'text'],
  fields: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'summary', label: 'Summary', type: 'longtext', required: true },
    { key: 'issues', label: 'Issues', type: 'table', columns: [{ key: 'issue', label: 'Issue', type: 'text' }, { key: 'severity', label: 'Severity', type: 'text' }] },
  ],
}

test('members and custom templates are Pro features', async () => {
  const { agent } = await signedIn(stack)
  assert.equal((await agent.post('/api/workspace/members').send({ email: 'x@example.com', role: 'editor' })).status, 402)
  assert.equal((await agent.post('/api/templates').send(customTemplate)).status, 402)
})

test('an invited viewer can read and export but not change anything', async () => {
  const owner = await signedIn(stack, { name: 'Owner One' })
  const viewer = await signedIn(stack, { name: 'Vik Viewer' })
  await owner.agent.put('/api/workspace/plan').send({ plan: 'pro' })
  const invite = await owner.agent.post('/api/workspace/members').send({ email: viewer.credentials.email, role: 'viewer' })
  assert.equal(invite.status, 201)
  assert.equal(invite.body.status, 'active') // existing account joins immediately

  const mine = (await viewer.agent.get('/api/workspaces')).body
  assert.equal(mine.length, 2)
  const switched = await viewer.agent.post('/api/workspaces/switch').send({ workspaceId: owner.session.workspace.id })
  assert.equal(switched.body.role, 'viewer')

  const docs = (await viewer.agent.get('/api/documents')).body
  assert.equal(docs.length, 3)
  const id = docs[0].id
  assert.equal((await viewer.agent.get(`/api/documents/${id}`)).status, 200)
  assert.equal((await viewer.agent.get(`/api/documents/${id}/export?format=md`)).status, 200)
  assert.equal((await viewer.agent.patch(`/api/documents/${id}`).send({ title: 'no' })).status, 403)
  assert.equal((await viewer.agent.post(`/api/documents/${id}/approve`)).status, 403)
  assert.equal((await viewer.agent.delete(`/api/documents/${id}`)).status, 403)
  assert.equal((await viewer.agent.post('/api/jobs').field('templateId', 'voice_bill').field('texts', '[{"text":"ek kilo cheeni"}]')).status, 403)
  assert.equal((await viewer.agent.put('/api/workspace/plan').send({ plan: 'free' })).status, 403)
})

test('invites for new emails wait until that person signs up', async () => {
  const owner = await signedIn(stack)
  await owner.agent.put('/api/workspace/plan').send({ plan: 'pro' })
  const email = `later${Date.now()}@example.com`
  const invite = await owner.agent.post('/api/workspace/members').send({ email, role: 'editor' })
  assert.equal(invite.body.status, 'invited')
  const newcomer = await signedIn(stack, { email })
  const mine = (await newcomer.agent.get('/api/workspaces')).body
  assert.ok(mine.some((w) => w.id === owner.session.workspace.id && w.role === 'editor'))
})

test('the last owner cannot be demoted, and nobody can remove themselves', async () => {
  const owner = await signedIn(stack)
  const members = (await owner.agent.get('/api/workspace/members')).body
  const me = members.find((m) => m.role === 'owner')
  await owner.agent.put('/api/workspace/plan').send({ plan: 'pro' })
  const demote = await owner.agent.patch(`/api/workspace/members/${me.id}`).send({ role: 'editor' })
  assert.equal(demote.status, 409)
  assert.equal(demote.body.error.code, 'last_owner')
  assert.equal((await owner.agent.delete(`/api/workspace/members/${me.id}`)).status, 409)
})

test('custom templates drive capture, validation and soft delete', async () => {
  const { agent } = await signedIn(stack)
  await agent.put('/api/workspace/plan').send({ plan: 'pro' })
  const bad = await agent.post('/api/templates').send({ ...customTemplate, fields: [{ key: 'Bad Key', label: 'x', type: 'text' }] })
  assert.equal(bad.status, 422)
  const created = await agent.post('/api/templates').send(customTemplate)
  assert.equal(created.status, 201)
  const tpl = created.body
  assert.equal(tpl.system, false)

  const job = await agent.post('/api/jobs').field('templateId', tpl.id).field('texts', JSON.stringify([{ text: 'Block B walkthrough\nCracks near the stairwell. Loose railing on floor 2.' }]))
  assert.equal(job.status, 201)
  await stack.worker.drain()
  const done = (await agent.get(`/api/jobs/${job.body.id}`)).body
  assert.equal(done.status, 'succeeded')

  assert.equal((await agent.delete(`/api/templates/${tpl.id}`)).status, 204)
  const list = (await agent.get('/api/templates')).body
  assert.ok(!list.some((t) => t.id === tpl.id))
  const doc = (await agent.get(`/api/documents/${done.documentId}`)).body
  assert.equal(doc.template.id, tpl.id) // the document keeps its schema
  assert.equal(doc.template.deleted, true)
  assert.equal((await agent.patch(`/api/templates/${tpl.id}`).send(customTemplate)).status, 404)
})

test('reference sources respect the plan limit', async () => {
  const { agent } = await signedIn(stack)
  // free plan: 3 sources, one sample already there
  for (const title of ['Syllabus', 'Policy']) {
    const r = await agent.post('/api/sources').field('title', title).field('text', `${title} text line one\nline two`)
    assert.equal(r.status, 201)
  }
  const fourth = await agent.post('/api/sources').field('title', 'Too many').field('text', 'x')
  assert.equal(fourth.status, 402)
  const list = (await agent.get('/api/sources')).body
  assert.equal(list.length, 3)
  assert.equal((await agent.delete(`/api/sources/${list[0].id}`)).status, 204)
  const file = await agent.post('/api/sources').field('title', 'Prices').attach('file', Buffer.from('Sugar | kg | 45\nMilk | L | 56'), { filename: 'prices.csv', contentType: 'text/csv' })
  assert.equal(file.status, 201)
  assert.equal(file.body.kind, 'file')
})
