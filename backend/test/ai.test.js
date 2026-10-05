import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { SYSTEM_TEMPLATES, sampleDocuments } from '@younifyai/shared'
import { docxText, pdfText, pptxText } from '../src/ai/extract.js'
import { hasAudioStream, keyFrames, makeTestVideo, speechAudio, workDir } from '../src/ai/media.js'
import { buildMessages, parseJsonReply } from '../src/ai/prompt.js'
import { GROQ_DEFAULTS } from '../src/ai/groq.js'
import { renderDocx, renderPdf } from '../src/services/exports.js'
import { signedIn, startStack } from './helpers.js'
import { startAiStub, startQdrantStub } from './stubs.js'

const notesTemplate = SYSTEM_TEMPLATES.find((t) => t.id === 'lecture_notes')
const notes = sampleDocuments()[0]
const notesDoc = { title: notes.content.title, templateName: notesTemplate.name, status: 'draft', version: 1, content: notes.content }

describe('document parsers', () => {
  test('PDF text comes back out of our own export', async () => {
    const { text, meta } = await pdfText(await renderPdf(notesTemplate, notesDoc))
    assert.equal(meta.pages, 1)
    assert.match(text, /Entropy/)
    assert.match(text, /Carnot/)
  })

  test('DOCX text comes back out of our own export', async () => {
    const { text } = await docxText(await renderDocx(notesTemplate, notesDoc))
    assert.match(text, /Reversible process/)
  })

  test('PPTX slides are read in order', async () => {
    const zip = new JSZip()
    const slide = (lines) => `<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${lines.map((l) => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join('')}</p:spTree></p:cSld></p:sld>`
    zip.file('ppt/slides/slide2.xml', slide(['Second law', 'Entropy &amp; heat']))
    zip.file('ppt/slides/slide1.xml', slide(['Thermodynamics 03']))
    const { text, meta } = await pptxText(await zip.generateAsync({ type: 'nodebuffer' }))
    assert.equal(meta.slides, 2)
    assert.equal(text, '[Slide 1]\nThermodynamics 03\n\n[Slide 2]\nSecond law\nEntropy & heat')
  })
})

describe('media', () => {
  test('ffmpeg pulls speech audio and key frames out of a video', async () => {
    const { dir, cleanup } = await workDir()
    try {
      const video = await makeTestVideo(path.join(dir, 'clip.mp4'), 4)
      assert.equal(await hasAudioStream(video), true)
      const parts = await speechAudio(video, dir)
      assert.equal(parts.length, 1)
      assert.ok((await fs.stat(parts[0])).size > 1000)
      const frames = await keyFrames(video, dir, { count: 3 })
      assert.ok(frames.length >= 2, `got ${frames.length} frames`)
    } finally {
      await cleanup()
    }
  })
})

describe('prompting', () => {
  test('messages carry the schema, the reference list and the inputs', () => {
    const t = SYSTEM_TEMPLATES.find((x) => x.id === 'voice_bill')
    const [system, user] = buildMessages({ template: t, text: 'do kilo chawal', sources: ['Basmati rice | kg | 120'], instructions: 'customer is Sharma ji', now: new Date('2026-09-21T20:00:00Z') })
    assert.match(system.content, /Never invent/)
    assert.match(user.content, /"items":\{"type":"array"/)
    assert.match(user.content, /Basmati rice \| kg \| 120/)
    assert.match(user.content, /customer is Sharma ji/)
    assert.match(user.content, /Today's date: 2026-09-22/)
  })

  test('JSON replies are recovered from fences and prose', () => {
    assert.deepEqual(parseJsonReply('```json\n{"a":1}\n```'), { a: 1 })
    assert.deepEqual(parseJsonReply('Here you go: {"a":{"b":2}} done'), { a: { b: 2 } })
    assert.throws(() => parseJsonReply('no json here'))
  })
})

describe('an OpenAI-compatible provider (Groq settings) end to end', () => {
  let ai
  let stack
  let tmp
  before(async () => {
    ai = await startAiStub()
    stack = await startStack({ AI_PROVIDER: 'groq', GROQ_API_KEY: 'test-key', AI_BASE_URL: `${ai.url}/openai/v1` })
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'younify-ai-'))
  })
  after(async () => {
    await stack.stop()
    await ai.close()
    await fs.rm(tmp, { recursive: true, force: true })
  })

  test('health names the provider and its models', async () => {
    const res = await stack.agent().get('/api/health')
    assert.equal(res.body.ai.provider, 'groq')
    assert.equal(res.body.ai.models.transcribe, GROQ_DEFAULTS.transcribe)
  })

  test('a voice note is transcribed, structured by the model and saved', async () => {
    const { agent } = await signedIn(stack)
    const { dir, cleanup } = await workDir()
    const video = await makeTestVideo(path.join(dir, 'v.mp4'), 2)
    const [audio] = await speechAudio(video, dir)
    const res = await agent.post('/api/jobs').field('templateId', 'voice_bill').attach('files', await fs.readFile(audio), { filename: 'counter.mp3', contentType: 'audio/mpeg' })
    await cleanup()
    assert.equal(res.status, 201)
    await stack.worker.drain()
    const job = (await agent.get(`/api/jobs/${res.body.id}`)).body
    assert.equal(job.status, 'succeeded', JSON.stringify({ error: job.error, stages: job.stages.map((s) => [s.key, s.status, s.log]) }))

    const stt = ai.calls.find((c) => c.url.endsWith('/audio/transcriptions'))
    assert.equal(stt.auth, 'Bearer test-key')
    assert.ok(stt.form.includes(GROQ_DEFAULTS.transcribe))
    assert.match(stt.form, /Hinglish shop order/) // the speech hint for bills

    const chat = ai.calls.filter((c) => c.url.endsWith('/chat/completions')).at(-1)
    assert.equal(chat.json.model, GROQ_DEFAULTS.chat)
    assert.deepEqual(chat.json.response_format, { type: 'json_object' })
    assert.match(chat.json.messages[1].content, /do kilo basmati chawal/)
    assert.match(chat.json.messages[1].content, /Basmati rice \| kg \| 120/) // the price list travelled with it

    const doc = (await agent.get(`/api/documents/${job.documentId}`)).body
    assert.equal(doc.engine, 'groq')
    assert.equal(doc.content.total, 240) // computed from the model's rows, not trusted blindly
    assert.ok(job.stages.find((s) => s.key === 'extract').log.some((l) => /speech-to-text/.test(l)))
  })

  test('an image is read by the vision model', async () => {
    const { agent } = await signedIn(stack)
    const { dir, cleanup } = await workDir()
    const video = await makeTestVideo(path.join(dir, 'v.mp4'), 2)
    const [frame] = await keyFrames(video, dir, { count: 1 })
    const res = await agent.post('/api/jobs').field('templateId', 'lecture_notes').attach('files', await fs.readFile(frame.path), { filename: 'board.jpg', contentType: 'image/jpeg' })
    await cleanup()
    await stack.worker.drain()
    const job = (await agent.get(`/api/jobs/${res.body.id}`)).body
    assert.equal(job.status, 'succeeded')
    const vision = ai.calls.find((c) => c.url.endsWith('/chat/completions') && Array.isArray(c.json.messages.at(-1).content))
    assert.equal(vision.json.model, GROQ_DEFAULTS.vision)
    assert.match(vision.json.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,/)
    assert.ok(job.stages.find((s) => s.key === 'extract').log.some((l) => /via vision/.test(l)))
  })

  test('when the model is down, the draft still arrives from the offline rules', async () => {
    ai.behaviour.failChat = true
    try {
      const { agent } = await signedIn(stack)
      const res = await agent.post('/api/jobs').field('templateId', 'meeting_report')
        .field('texts', JSON.stringify([{ text: 'Sync\nRavi: I will send the quote by Friday.' }]))
      await stack.worker.drain()
      const job = (await agent.get(`/api/jobs/${res.body.id}`)).body
      assert.equal(job.status, 'succeeded')
      assert.ok(job.stages.find((s) => s.key === 'generate').log.some((l) => /groq could not generate .*503.*used offline rules/.test(l)))
      const doc = (await agent.get(`/api/documents/${job.documentId}`)).body
      assert.equal(doc.engine, 'offline')
      assert.ok(doc.content.action_items.some((a) => a.owner === 'Ravi'))
    } finally {
      ai.behaviour.failChat = false
    }
  })
})

describe('Qdrant as the vector store', () => {
  let qdrant
  let stack
  before(async () => {
    qdrant = await startQdrantStub()
    stack = await startStack({ QDRANT_URL: qdrant.url })
  })
  after(async () => {
    await stack.stop()
    await qdrant.close()
  })

  test('reference chunks are indexed per workspace and retrieval stays inside it', async () => {
    const a = await signedIn(stack)
    const b = await signedIn(stack)
    assert.ok(qdrant.requests.some((r) => r.method === 'PUT' && /\/collections\/younify_chunks$/.test(r.url)))
    const aWs = a.session.workspace.id
    assert.ok(qdrant.points.some((p) => p.payload.workspace_id === aWs && p.payload.scope === 'voice_bill'))

    await b.agent.post('/api/sources').field('title', 'B secret prices').field('templateId', 'voice_bill').field('text', 'Basmati rice | kg | 999')
    const res = await a.agent.post('/api/jobs').field('templateId', 'voice_bill').field('texts', JSON.stringify([{ text: 'do kilo basmati chawal' }]))
    await stack.worker.drain()
    const job = (await a.agent.get(`/api/jobs/${res.body.id}`)).body
    const retrieveLog = job.stages.find((s) => s.key === 'retrieve').log
    assert.ok(retrieveLog.some((l) => /Store price list/.test(l)))
    assert.ok(!retrieveLog.some((l) => /B secret prices/.test(l)))
    const searches = qdrant.requests.filter((r) => r.url.includes('/points/search'))
    assert.ok(searches.every((s) => s.json.filter.must.some((m) => m.key === 'workspace_id')))

    const src = (await b.agent.get('/api/sources')).body.find((s) => s.title === 'B secret prices')
    await b.agent.delete(`/api/sources/${src.id}`)
    assert.ok(!qdrant.points.some((p) => p.payload.source_id === src.id))
  })
})
