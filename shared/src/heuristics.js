// Offline, rules-based structuring. Runs with no AI provider configured:
// the mock API uses it in the browser, the backend uses it as its fallback generator.
// It is deliberately conservative — it extracts what the text clearly says and
// leaves the rest empty for the reviewer.

import { computeDerived, normalizeContent } from './document.js'

/* --------------------------------------------------------------- basics */

export function splitSentences(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?।])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
}

const firstLine = (text = '') => String(text).split(/\r?\n/).map((l) => l.trim()).find(Boolean) || ''
/** YYYY-MM-DD of `d` in a time zone (documents are dated where the person is, not in UTC). */
export function localDate(d = new Date(), timeZone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d))
}
const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

const STOP = new Set('the a an and or of to in on at for with is are was were be been it this that these those from by as we you i he she they our your their will would can could should about into over under than then there here have has had not no do does did just also very more most'.split(' '))

function keywords(text, n = 5) {
  const counts = new Map()
  for (const w of String(text).toLowerCase().match(/[a-z][a-z-]{3,}/g) || []) {
    if (STOP.has(w)) continue
    counts.set(w, (counts.get(w) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w)
}

/* ------------------------------------------------------------ price list */

const UNIT_ALIASES = {
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  l: 'L', lt: 'L', ltr: 'L', litre: 'L', liter: 'L', litres: 'L', liters: 'L',
  ml: 'ml',
  pc: 'pc', pcs: 'pc', piece: 'pc', pieces: 'pc', packet: 'pc', packets: 'pc', pkt: 'pc', nos: 'pc',
  dozen: 'dozen', dz: 'dozen',
}
const normUnit = (u) => (u ? UNIT_ALIASES[u.toLowerCase().replace(/\.$/, '')] || null : null)

/**
 * Parse a free-form price list. Accepts lines such as
 *   "Basmati rice | kg | 120", "Mustard oil — ₹180/L", "Biscuits, pc, 10", "Sugar 45/kg"
 */
export function parsePriceList(text = '') {
  const out = []
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^#/.test(line)) continue
    const parts = line.split(/\s*[|,;\t]\s*/).filter(Boolean)
    if (parts.length >= 3 && /\d/.test(parts[2]) && !/\d/.test(parts[0])) {
      const rate = Number(parts[2].replace(/[^0-9.]/g, ''))
      if (Number.isFinite(rate)) out.push({ item: parts[0], unit: normUnit(parts[1]) || parts[1], rate })
      continue
    }
    const m = line.match(/^(.*?)[\s:—–-]*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:\/|per\s+)?\s*([a-zA-Z]+)?\s*$/i)
    if (m && m[1].trim() && !/\d/.test(m[1])) {
      out.push({ item: m[1].replace(/[—–:\-₹\s]+$/, '').trim(), unit: normUnit(m[3]) || m[3] || 'pc', rate: Number(m[2]) })
    }
  }
  return out
}

/* ------------------------------------------------------------ bill items */

const NUMBER_WORDS = {
  ek: 1, one: 1, a: 1, an: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4,
  paanch: 5, panch: 5, five: 5, chhe: 6, che: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8,
  nau: 9, nine: 9, das: 10, ten: 10, gyarah: 11, barah: 12, twelve: 12, dhai: 2.5, dedh: 1.5, aadha: 0.5, half: 0.5,
}
// Hindi/Hinglish grocery words → English, used for matching against the price list
const SYNONYMS = {
  chawal: 'rice', chaawal: 'rice', tel: 'oil', sarson: 'mustard', aata: 'flour', atta: 'flour',
  cheeni: 'sugar', chini: 'sugar', doodh: 'milk', dal: 'lentils', daal: 'lentils', namak: 'salt',
  aloo: 'potatoes', pyaaz: 'onions', pyaz: 'onions', tamatar: 'tomatoes', anda: 'eggs', ande: 'eggs',
  chai: 'tea', patti: 'leaf', sabun: 'soap', biscuit: 'biscuits', biskut: 'biscuits', maida: 'flour',
}
const FILLER = new Set(['aur', 'and', 'ka', 'ki', 'ke', 'of', 'please', 'bhi', 'de', 'do', 'dena', 'dijiye', 'total', 'bata', 'the', 'some', 'also'])

const stem = (w) => w.replace(/(es|s)$/, '')
function tokens(s) {
  return String(s).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
    .map((w) => SYNONYMS[w] || w).flatMap((w) => w.split(' ')).map(stem)
}

function bestMatch(name, priceList) {
  const want = new Set(tokens(name))
  let best = null
  let bestScore = 0
  for (const p of priceList) {
    const have = tokens(p.item)
    const overlap = have.filter((w) => want.has(w)).length
    const score = overlap / Math.max(have.length, 1)
    if (overlap && score > bestScore) { best = p; bestScore = score }
  }
  return best ? { ...best, score: bestScore } : null
}

/** Pull "quantity unit item" phrases out of a spoken order. */
export function parseBillItems(text = '', priceList = []) {
  const chunks = String(text)
    .toLowerCase()
    .replace(/[“”"]/g, '')
    .split(/,|\baur\b|\band\b|\bphir\b|\bthen\b|\n|;|\.(?=\s|$)/)
    .map((c) => c.trim())
    .filter(Boolean)
  const items = []
  for (const chunk of chunks) {
    const words = chunk.split(/\s+/)
    let qty = null
    let unit = null
    const rest = []
    for (const w of words) {
      const num = w.match(/^(\d+(?:\.\d+)?)([a-z]+)?$/)
      if (qty == null && num) { qty = Number(num[1]); if (num[2]) unit = normUnit(num[2]); continue }
      if (qty == null && w in NUMBER_WORDS && !(w === 'do' && rest.length)) { qty = NUMBER_WORDS[w]; continue }
      if (!unit && normUnit(w)) { unit = normUnit(w); continue }
      if (FILLER.has(w)) continue
      rest.push(w)
    }
    const spoken = rest.join(' ').trim()
    if (!spoken || qty == null) continue
    const match = bestMatch(spoken, priceList)
    const rate = match ? match.rate : null
    const u = unit || match?.unit || 'pc'
    items.push({
      item: match ? match.item : cap(spoken.split(' ').map((w) => SYNONYMS[w] || w).join(' ')),
      qty,
      unit: u,
      rate,
      amount: rate != null ? Math.round(qty * rate * 100) / 100 : null,
      matched: !!match,
    })
  }
  return items
}

/* ------------------------------------------------------- meeting parsing */

const SPEAKER = /^([A-Z][a-zA-Z]{1,20})(?:\s*\([^)]*\))?\s*[:\-–]\s+(.*)$/
const DECISION = /\b(decided|agreed|approved|final(?:ised|ized)?|will move|going with|we'll go|sign(?:ed)? off)\b/i
const ACTION = /\b(i will|i'll|will (?:send|update|share|prepare|call|fix|publish|create|check|draft|book|follow)|need to|needs to|to do|action|by (?:mon|tue|wed|thu|fri|sat|sun|tomorrow|today|eod|next week))/i
const RISK = /\b(risk|blocker|blocked|delay|delayed|not confirmed|issue|problem|concern|shortage|stock-?out)\b/i

/** A due date named in the sentence, relative to `today` (YYYY-MM-DD). */
function dueFrom(sentence, today) {
  const s = sentence.toLowerCase()
  if (/\btomorrow\b/.test(s)) return addDays(today, 1)
  if (/\btoday\b|\beod\b/.test(s)) return today
  if (/\bnext week\b/.test(s)) return addDays(today, 7)
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const m = s.match(/\bby (sun|mon|tue|wed|thu|fri|sat)[a-z]*/)
  if (m) {
    const target = days.indexOf(m[1])
    const diff = (target - new Date(`${today}T00:00:00Z`).getUTCDay() + 7) % 7 || 7
    return addDays(today, diff)
  }
  const iso = s.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  return iso ? iso[1] : ''
}

function cleanTask(s) {
  return cap(s.replace(/^(i will|i'll|we will|we'll|will|need to|needs to|to do:?|action:?)\s+/i, '')
    .replace(/\s+by (?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|\s+by tomorrow|\s+by today|\s+by eod|\s+by next week/i, '')
    .replace(/[.!]+$/, '').trim())
}

/* ------------------------------------------------------------ structure */

/**
 * Structure raw text into a template's content without a language model.
 * @param {object} template  a catalog template
 * @param {{text?: string, sources?: string[], now?: Date, hints?: object}} input
 */
export function offlineStructure(template, { text = '', sources = [], now = new Date(), timeZone = 'Asia/Kolkata', hints = {} } = {}) {
  const t = String(text || '').trim()
  const sentences = splitSentences(t.replace(/\n+/g, '. ').replace(/\.\s*\./g, '.'))
  const today = localDate(now, timeZone)
  const head = firstLine(t)
  const title = head && head.length <= 80 && !/[.!?]$/.test(head) ? head : ''
  let raw = {}

  switch (template.id) {
    case 'lecture_notes': {
      const body = title ? sentences.filter((s) => s.replace(/[.]$/, '') !== title) : sentences
      const concepts = []
      for (const s of body) {
        const m = s.match(/^(?:an?\s+|the\s+)?([A-Z]?[\w\s-]{2,40}?)\s+(?:is|are|means|refers to)\s+(.{8,})$/i)
        if (m && concepts.length < 6) concepts.push({ term: cap(m[1].trim()), definition: cap(m[2].replace(/[.]$/, '')) })
      }
      raw = {
        title: title || hints.title || `Notes: ${cap(keywords(t, 2).join(' and ')) || 'lecture'}`,
        course: hints.course || '',
        date: today,
        summary: body.slice(0, 3).join(' '),
        key_points: body.slice(0, 8).map((s) => clip(s.replace(/[.]$/, ''), 160)),
        concepts,
        questions: (concepts.length ? concepts.map((c) => `Explain ${c.term.toLowerCase()} in your own words.`) : keywords(t, 3).map((k) => `What is the role of ${k} in this lecture?`)).slice(0, 5),
      }
      break
    }
    case 'meeting_report': {
      const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      const attendees = new Set()
      const said = []
      for (const l of lines) {
        const m = l.match(SPEAKER)
        if (m) { attendees.add(m[1]); said.push({ who: m[1], text: m[2] }) } else if (l !== head || !title) said.push({ who: '', text: l })
      }
      const statements = said.flatMap(({ who, text: tx }) => splitSentences(tx).map((s) => ({ who, s })))
      raw = {
        title: title || hints.title || 'Meeting report',
        date: today,
        attendees: [...attendees],
        summary: statements.slice(0, 3).map((x) => x.s).join(' '),
        decisions: statements.filter((x) => DECISION.test(x.s)).map((x) => x.s.replace(/^we\s+/i, 'We ')),
        action_items: statements.filter((x) => ACTION.test(x.s) && !DECISION.test(x.s)).map((x) => ({ task: cleanTask(x.s), owner: x.who, due: dueFrom(x.s, today) })),
        risks: statements.filter((x) => RISK.test(x.s) && !ACTION.test(x.s)).map((x) => x.s.replace(/^risk\s*[—–:-]\s*/i, '')),
      }
      break
    }
    case 'journey_diary': {
      const moments = []
      const rest = []
      for (const l of t.split(/\r?\n/)) {
        const m = l.trim().match(/^(\d{1,2}[:.]\d{2})\s*(?:am|pm)?\s*[-–—:]?\s*(.+)$/i)
        if (m) moments.push({ time: m[1].replace('.', ':').padStart(5, '0'), moment: cap(m[2].trim()) })
        else if (l.trim()) rest.push(l.trim())
      }
      const place = t.match(/\b(?:in|at|to)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/)
      raw = {
        title: title && !/^\d/.test(title) ? title : hints.title || (place ? `A day in ${place[1]}` : 'Diary entry'),
        date: today,
        place: place ? place[1] : '',
        entry: rest.join(' ') || moments.map((m) => m.moment).join('. '),
        moments,
        tags: keywords(t, 4),
      }
      break
    }
    case 'voice_bill': {
      const priceList = sources.flatMap((s) => parsePriceList(s))
      const items = parseBillItems(t, priceList)
      const unmatched = items.filter((i) => !i.matched).map((i) => i.item)
      raw = {
        bill_no: hints.bill_no || String(Math.floor(now.getTime() / 1000) % 10000).padStart(4, '0'),
        date: today,
        customer: hints.customer || 'Walk-in',
        items: items.map(({ matched, ...i }) => i),
        tax: 0,
        notes: unmatched.length ? `Not on your price list: ${unmatched.join(', ')}. Add a rate before approving.` : '',
      }
      break
    }
    default: {
      // custom templates: fill text fields with the summary, lists with sentences
      for (const f of template.fields) {
        if (f.key === 'title') raw.title = title || template.name
        else if (f.type === 'longtext') raw[f.key] = sentences.slice(0, 4).join(' ')
        else if (f.type === 'list') raw[f.key] = sentences.slice(0, 5)
        else if (f.type === 'date') raw[f.key] = today
      }
    }
  }
  return computeDerived(template, normalizeContent(template, raw))
}
