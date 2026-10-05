import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { chaptersFromDescription, formatTranscript, youtubeId } from '../src/ai/youtube.js'
import { lectureNotesFromTranscript, parseTranscriptBlock, templateById, validateDocument, normalizeContent } from '@younifyai/shared'
import { signedIn, startStack } from './helpers.js'

describe('YouTube links', () => {
  test('video ids come out of every common link shape', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=aircAruvnKk',
      'https://youtube.com/watch?feature=share&v=aircAruvnKk&t=30',
      'https://youtu.be/aircAruvnKk?si=abc',
      'https://m.youtube.com/watch?v=aircAruvnKk',
      'https://www.youtube.com/shorts/aircAruvnKk',
      'https://www.youtube.com/live/aircAruvnKk?feature=share',
      'https://www.youtube.com/embed/aircAruvnKk',
    ]) assert.equal(youtubeId(url), 'aircAruvnKk', url)
    assert.equal(youtubeId('https://vimeo.com/123'), null)
    assert.equal(youtubeId('not a link'), null)
  })

  test('chapters are read from a description only when they start at 0:00', () => {
    const d = 'Intro text\n0:00 Introduction\n1:07 Series preview\n1:02:03 - Wrap up\nmore text'
    assert.deepEqual(chaptersFromDescription(d), [
      { start: 0, title: 'Introduction' }, { start: 67, title: 'Series preview' }, { start: 3723, title: 'Wrap up' },
    ])
    assert.deepEqual(chaptersFromDescription('2:00 not a chapter list\n3:00 another'), [])
  })

  test('captions become timestamped paragraphs with a header the notes can use', () => {
    const segs = Array.from({ length: 12 }, (_, i) => ({ start: i * 10, text: `Sentence number ${i} about gradient descent and loss.` }))
    const text = formatTranscript({ title: 'Lecture 4', channel: 'MIT OCW', durationSeconds: 3725, chapters: [{ start: 0, title: 'Intro' }, { start: 60, title: 'Loss' }] }, segs, 45)
    assert.match(text, /^Video: Lecture 4\nChannel: MIT OCW\nLength: 1:02:05/)
    assert.match(text, /Chapters:\n\[00:00\] Intro\n\[01:00\] Loss/)
    const block = parseTranscriptBlock(text)
    assert.equal(block.title, 'Lecture 4')
    assert.deepEqual(block.paras.map((p) => p.ts), ['00:00', '00:50', '01:40'])
  })

  test('offline notes from a transcript follow the chapters and stay valid', () => {
    const segs = [
      'Gradient descent is an algorithm that minimises a loss function by stepping downhill.',
      'The learning rate controls how big each step is.',
      'A loss function measures how wrong the predictions of the model are.',
      'If the learning rate is too large the loss can diverge.',
      'Stochastic gradient descent uses small random batches of the data.',
      'Each gradient descent step moves the weights against the gradient of the loss.',
      'Momentum keeps a running average of past gradients to smooth the path.',
      'The loss usually falls quickly at first and then flattens out.',
    ].map((t, i) => ({ start: i * 40, text: t }))
    const text = formatTranscript({ title: 'Optimisation', channel: 'Prof. Rao', chapters: [{ start: 0, title: 'Gradient descent' }, { start: 160, title: 'Stochastic methods' }] }, segs, 30)
    const t = templateById('lecture_notes')
    const c = normalizeContent(t, { ...lectureNotesFromTranscript(text), date: '2026-09-22' })
    assert.equal(c.title, 'Optimisation')
    assert.equal(c.course, 'Prof. Rao')
    assert.match(c.key_points[0], /^Gradient descent \(00:00\): /)
    assert.match(c.key_points[1], /^Stochastic methods \(02:40\): /)
    assert.ok(c.concepts.some((x) => /gradient descent|loss function/i.test(x.term)))
    assert.ok(validateDocument(t, c).ok)
  })
})

// Hits YouTube for real. Run with YT_LIVE=1 (it is what the demo depends on).
describe('YouTube lecture → notes, live', { skip: !process.env.YT_LIVE && 'set YT_LIVE=1 to run against YouTube' }, () => {
  let stack
  before(async () => { stack = await startStack() })
  after(async () => { await stack.stop() })

  test('a real lecture link becomes lecture notes', async () => {
    const { agent } = await signedIn(stack)
    const preview = await agent.post('/api/links/preview').send({ url: 'https://youtu.be/aircAruvnKk' })
    assert.equal(preview.status, 200)
    assert.equal(preview.body.channel, '3Blue1Brown')
    assert.equal(preview.body.hasCaptions, true)

    const res = await agent.post('/api/jobs').field('templateId', 'lecture_notes')
      .field('links', JSON.stringify([{ url: 'https://youtu.be/aircAruvnKk', title: preview.body.title }]))
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.inputs[0].url, 'https://www.youtube.com/watch?v=aircAruvnKk')
    await stack.worker.drain(60_000)
    const job = (await agent.get(`/api/jobs/${res.body.id}`)).body
    assert.equal(job.status, 'succeeded', job.error)
    assert.ok(job.stages.find((s) => s.key === 'extract').log.some((l) => /uploaded captions/.test(l)))
    const doc = (await agent.get(`/api/documents/${job.documentId}`)).body
    assert.match(doc.title, /neural network/i)
    assert.equal(doc.content.course, '3Blue1Brown')
    assert.ok(doc.content.key_points.length >= 8)
    assert.equal(doc.inputs[0].url, 'https://www.youtube.com/watch?v=aircAruvnKk')
  })

  test('a link that is not a video is refused before a job starts', async () => {
    const { agent } = await signedIn(stack)
    const res = await agent.post('/api/jobs').field('templateId', 'lecture_notes').field('links', JSON.stringify([{ url: 'https://example.com/lecture' }]))
    assert.equal(res.status, 422)
  })
})
