import { test } from 'node:test'
import assert from 'node:assert/strict'
import { templateById, parsePriceList, parseBillItems, offlineStructure, validateDocument } from '../src/index.js'

const PRICE_LIST = `
Basmati rice | kg | 120
Mustard oil — ₹180/L
Biscuits, pc, 10
Sugar 45/kg
`

test('parsePriceList reads pipes, dashes, commas and slash units', () => {
  const list = parsePriceList(PRICE_LIST)
  assert.deepEqual(list.map((p) => [p.item, p.unit, p.rate]), [
    ['Basmati rice', 'kg', 120],
    ['Mustard oil', 'L', 180],
    ['Biscuits', 'pc', 10],
    ['Sugar', 'kg', 45],
  ])
})

test('parseBillItems understands Hinglish quantities and matches the price list', () => {
  const items = parseBillItems('do kilo basmati chawal, ek litre sarson ka tel, aur paanch biscuit packet', parsePriceList(PRICE_LIST))
  assert.deepEqual(items.map((i) => [i.item, i.qty, i.unit, i.rate, i.amount]), [
    ['Basmati rice', 2, 'kg', 120, 240],
    ['Mustard oil', 1, 'L', 180, 180],
    ['Biscuits', 5, 'pc', 10, 50],
  ])
})

test('parseBillItems keeps unknown items without a rate', () => {
  const items = parseBillItems('3 kg potatoes', [])
  assert.equal(items.length, 1)
  assert.equal(items[0].qty, 3)
  assert.equal(items[0].rate, null)
  assert.match(items[0].item, /potato/i)
})

test('offlineStructure builds a valid voice bill', () => {
  const t = templateById('voice_bill')
  const c = offlineStructure(t, { text: 'do kilo basmati chawal aur ek litre sarson tel', sources: [PRICE_LIST], now: new Date('2026-09-21T10:00:00Z') })
  assert.equal(c.total, 420)
  assert.equal(c.date, '2026-09-21')
  assert.ok(validateDocument(t, c).ok)
})

test('offlineStructure pulls decisions, owners and risks out of a chat log', () => {
  const t = templateById('meeting_report')
  const text = [
    'Ops sync',
    'Meera: Stock-outs hit rice and oil twice this week.',
    'Anu: We agreed to move both vendors to weekly orders.',
    'Ravi: I will update the stock sheet by Friday.',
    'Dev: Risk — vendor B has not confirmed weekly delivery.',
  ].join('\n')
  const c = offlineStructure(t, { text, now: new Date('2026-09-21T10:00:00Z') })
  assert.equal(c.title, 'Ops sync')
  assert.deepEqual(c.attendees.sort(), ['Anu', 'Dev', 'Meera', 'Ravi'])
  assert.ok(c.decisions.some((d) => /weekly orders/.test(d)))
  assert.ok(c.action_items.some((a) => a.owner === 'Ravi' && /stock sheet/.test(a.task)))
  assert.ok(c.risks.some((r) => /vendor B/.test(r)))
  assert.ok(validateDocument(t, c).ok)
})

test('offlineStructure gives lecture notes a summary, points and concepts', () => {
  const t = templateById('lecture_notes')
  const text = 'Entropy and the second law. Entropy is a measure of disorder in a system. The second law says entropy of an isolated system never decreases. A Carnot engine is the most efficient engine between two temperatures. Real engines lose energy to friction.'
  const c = offlineStructure(t, { text, now: new Date('2026-09-21T10:00:00Z') })
  assert.ok(c.summary.length > 20)
  assert.ok(c.key_points.length >= 2)
  assert.ok(c.concepts.some((x) => /entropy/i.test(x.term)))
  assert.ok(c.questions.length >= 1)
  assert.ok(validateDocument(t, c).ok)
})

test('offlineStructure turns timed notes into diary moments', () => {
  const t = templateById('journey_diary')
  const c = offlineStructure(t, { text: '06:10 sunrise at the ghat\n11:30 crossed the bridge\nGreat day in Rishikesh.', now: new Date('2026-09-21T10:00:00Z') })
  assert.deepEqual(c.moments.map((m) => m.time), ['06:10', '11:30'])
  assert.ok(validateDocument(t, c).ok)
})

test('documents are dated in India time and due dates follow from it', async () => {
  const { localDate } = await import('../src/index.js')
  // 18:32 UTC on the 21st is already the 22nd in India
  assert.equal(localDate(new Date('2026-09-21T18:32:00Z')), '2026-09-22')
  const t = templateById('meeting_report')
  const c = offlineStructure(t, { text: 'Sync\nRavi: I will send the quote by Friday.\nAnu: I will book the hall tomorrow.', now: new Date('2026-09-21T18:32:00Z') })
  assert.equal(c.date, '2026-09-22') // a Tuesday
  assert.deepEqual(c.action_items.map((a) => a.due), ['2026-09-25', '2026-09-23'])
})
