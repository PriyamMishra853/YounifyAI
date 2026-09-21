import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { captureText, signedIn, startStack } from './helpers.js'

let stack
before(async () => { stack = await startStack() })
after(async () => { await stack.stop() })

test('a Hinglish voice order becomes a priced bill through all seven stages', async () => {
  const { agent } = await signedIn(stack)
  const { res, job } = await captureText(stack, agent, 'voice_bill', 'teen kilo basmati chawal, do litre sarson ka tel, aur das biscuit packet')
  assert.equal(res.status, 201)
  assert.equal(job.status, 'succeeded', JSON.stringify(job))
  assert.deepEqual(job.stages.map((s) => s.key), ['capture', 'extract', 'normalize', 'retrieve', 'generate', 'validate', 'deliver'])
  assert.ok(job.stages.every((s) => s.status === 'done'), JSON.stringify(job.stages.map((s) => [s.key, s.status])))
  assert.ok(job.stages.find((s) => s.key === 'retrieve').log.some((l) => /Store price list/.test(l)))
  assert.ok(job.stages.find((s) => s.key === 'normalize').log.includes('Language: hi-en'))

  const doc = (await agent.get(`/api/documents/${job.documentId}`)).body
  assert.equal(doc.status, 'draft')
  assert.equal(doc.jobId, job.id)
  assert.equal(doc.template.id, 'voice_bill')
  assert.deepEqual(doc.content.items.map((i) => [i.item, i.qty, i.amount]), [['Basmati rice', 3, 360], ['Mustard oil', 2, 360], ['Biscuits', 10, 100]])
  assert.equal(doc.content.total, 820)
  assert.deepEqual(doc.issues, [])
  assert.equal(doc.inputs[0].kind, 'text')
})

test('a chat log becomes a meeting report with owners', async () => {
  const { agent } = await signedIn(stack)
  const text = 'Ops sync\nMeera: Stock-outs hit rice twice.\nAnu: We agreed to move vendors to weekly orders.\nRavi: I will update the stock sheet by Friday.'
  const { job } = await captureText(stack, agent, 'meeting_report', text)
  assert.equal(job.status, 'succeeded')
  const doc = (await agent.get(`/api/documents/${job.documentId}`)).body
  assert.equal(doc.title, 'Ops sync')
  assert.ok(doc.content.action_items.some((a) => a.owner === 'Ravi'))
})

test('the offline provider fails clearly on inputs it cannot read', async () => {
  const { agent } = await signedIn(stack)
  const res = await agent.post('/api/jobs').field('templateId', 'lecture_notes').attach('files', Buffer.from('RIFF....WAVEfmt '), { filename: 'lecture.wav', contentType: 'audio/wav' })
  assert.equal(res.status, 201)
  assert.equal(res.body.inputs[0].kind, 'voice')
  await stack.worker.drain()
  const job = (await agent.get(`/api/jobs/${res.body.id}`)).body
  assert.equal(job.status, 'failed')
  assert.match(job.error, /GROQ_API_KEY/)
  assert.equal(job.stages.find((s) => s.key === 'extract').status, 'failed')
})

test('a .txt upload is read without any AI provider', async () => {
  const { agent } = await signedIn(stack)
  const res = await agent.post('/api/jobs').field('templateId', 'journey_diary')
    .attach('files', Buffer.from('06:10 sunrise at the ghat\n11:30 crossed the bridge\nA calm day in Rishikesh.'), { filename: 'notes.txt', contentType: 'text/plain' })
  assert.equal(res.status, 201)
  await stack.worker.drain()
  const job = (await agent.get(`/api/jobs/${res.body.id}`)).body
  assert.equal(job.status, 'succeeded')
  const doc = (await agent.get(`/api/documents/${job.documentId}`)).body
  assert.deepEqual(doc.content.moments.map((m) => m.time), ['06:10', '11:30'])
})

test('templates refuse input types they do not accept', async () => {
  const { agent } = await signedIn(stack)
  const res = await agent.post('/api/jobs').field('templateId', 'voice_bill').attach('files', Buffer.from('%PDF-1.4'), { filename: 'menu.pdf', contentType: 'application/pdf' })
  assert.equal(res.status, 422)
  assert.match(res.body.error.message, /does not take docs/)
})

test('the free plan stops at five documents a day', async () => {
  const { agent } = await signedIn(stack)
  for (let i = 0; i < 5; i++) {
    const r = await agent.post('/api/jobs').field('templateId', 'meeting_report').field('texts', JSON.stringify([{ text: `Sync ${i}\nWe agreed on item ${i}.` }]))
    assert.equal(r.status, 201)
  }
  const sixth = await agent.post('/api/jobs').field('templateId', 'meeting_report').field('texts', JSON.stringify([{ text: 'one more' }]))
  assert.equal(sixth.status, 429)
  assert.equal(sixth.body.error.code, 'quota_exceeded')
  const usage = (await agent.get('/api/workspace/usage')).body
  assert.deepEqual([usage.used, usage.limit, usage.plan], [5, 5, 'free'])
  await stack.worker.drain()
  // upgrading lifts the limit
  assert.equal((await agent.put('/api/workspace/plan').send({ plan: 'premium' })).status, 200)
  const seventh = await agent.post('/api/jobs').field('templateId', 'meeting_report').field('texts', JSON.stringify([{ text: 'after upgrade' }]))
  assert.equal(seventh.status, 201)
  await stack.worker.drain()
})

test('job progress streams over server-sent events', async () => {
  const { agent } = await signedIn(stack)
  // hold the worker so the stream is open before the job starts moving
  await stack.worker.stop()
  const created = await agent.post('/api/jobs').field('templateId', 'lecture_notes').field('texts', JSON.stringify([{ text: 'Entropy is a measure of disorder. The second law says it never decreases.' }]))
  setTimeout(() => stack.worker.start(), 300)
  const res = await agent.get(`/api/jobs/${created.body.id}/events`).buffer(true).parse((r, cb) => {
    let data = ''
    r.on('data', (c) => { data += c })
    r.on('end', () => cb(null, data))
  })
  assert.match(res.body.split('\n\n')[0], /"status":"queued"/)
  assert.match(res.headers['content-type'], /^text\/event-stream/)
  const events = res.body.split('\n\n').filter((e) => e.startsWith('event: job'))
  assert.ok(events.length >= 2, `expected several updates, got ${events.length}`)
  const last = JSON.parse(events.at(-1).split('data: ')[1])
  assert.equal(last.status, 'succeeded')
  assert.match(res.body, /event: end/)
})
