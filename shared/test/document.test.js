import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  templateById, emptyContent, normalizeContent, validateDocument, computeDerived, toMarkdown, toJsonSchema,
} from '../src/index.js'

const bill = templateById('voice_bill')
const report = templateById('meeting_report')
const notes = templateById('lecture_notes')

test('emptyContent gives every field a typed default', () => {
  const c = emptyContent(bill)
  assert.equal(c.bill_no, '')
  assert.deepEqual(c.items, [])
  assert.equal(c.total, null)
})

test('normalizeContent coerces model output into the template shape', () => {
  const raw = {
    bill_no: 412,
    date: '2026-09-21T10:00:00Z',
    items: [{ item: ' Basmati rice ', qty: '2', unit: 'kg', rate: '₹120', amount: '240', junk: 1 }],
    total: '470.00',
    extra_field: 'dropped',
  }
  const c = normalizeContent(bill, raw)
  assert.equal(c.bill_no, '412')
  assert.equal(c.date, '2026-09-21')
  assert.deepEqual(c.items[0], { item: 'Basmati rice', qty: 2, unit: 'kg', rate: 120, amount: 240 })
  assert.equal(c.total, 470)
  assert.equal('extra_field' in c, false)
  assert.deepEqual(normalizeContent(notes, { key_points: 'one\ntwo' }).key_points, ['one', 'two'])
})

test('validateDocument reports missing required fields as errors', () => {
  const { issues, ok } = validateDocument(report, emptyContent(report))
  assert.equal(ok, false)
  const fields = issues.filter((i) => i.level === 'error').map((i) => i.field)
  assert.deepEqual(fields.sort(), ['date', 'summary', 'title'])
})

test('validateDocument checks bill arithmetic', () => {
  const content = normalizeContent(bill, {
    bill_no: '0412', date: '2026-09-21',
    items: [{ item: 'Rice', qty: 2, unit: 'kg', rate: 120, amount: 200 }],
    subtotal: 200, tax: 0, total: 999,
  })
  const { issues } = validateDocument(bill, content)
  const msgs = issues.map((i) => i.message).join(' | ')
  assert.match(msgs, /Rice/)
  assert.match(msgs, /240/)
  assert.match(msgs, /Total/)
})

test('computeDerived fixes bill amounts and totals', () => {
  const content = computeDerived(bill, normalizeContent(bill, {
    items: [{ item: 'Rice', qty: 2, rate: 120 }, { item: 'Oil', qty: 1, rate: 180 }],
    tax: 21,
  }))
  assert.equal(content.items[0].amount, 240)
  assert.equal(content.subtotal, 420)
  assert.equal(content.total, 441)
  assert.equal(validateDocument(bill, { ...content, bill_no: '1', date: '2026-09-21' }).ok, true)
})

test('meeting report warns about action items without an owner', () => {
  const content = normalizeContent(report, {
    title: 'Sync', date: '2026-09-21', summary: 'ok',
    action_items: [{ task: 'Send quote', owner: '', due: '' }],
  })
  const { issues, ok } = validateDocument(report, content)
  assert.equal(ok, true, 'warnings do not block approval')
  assert.ok(issues.some((i) => i.level === 'warning' && /owner/i.test(i.message)))
})

test('toMarkdown renders headings, lists and tables', () => {
  const md = toMarkdown(notes, normalizeContent(notes, {
    title: 'Entropy', summary: 'Disorder.', key_points: ['a', 'b'],
    concepts: [{ term: 'Entropy', definition: 'Disorder' }],
  }))
  assert.match(md, /^# Entropy/)
  assert.match(md, /- a\n- b/)
  assert.match(md, /\| Term \| Definition \|/)
})

test('toJsonSchema describes the template for structured generation', () => {
  const schema = toJsonSchema(bill)
  assert.equal(schema.type, 'object')
  assert.equal(schema.properties.items.type, 'array')
  assert.equal(schema.properties.items.items.properties.qty.type, 'number')
  assert.ok(schema.required.includes('total'))
})
