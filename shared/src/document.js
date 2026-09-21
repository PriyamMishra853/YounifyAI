// Document content helpers driven entirely by a template's field schema.
// Used by the editor (live validation), the generator (normalizing model output),
// the validator stage of the pipeline and the exporters.

const SCALAR_DEFAULT = { text: '', longtext: '', date: '', number: null, money: null }

export function emptyContent(template) {
  const out = {}
  for (const f of template.fields) {
    if (f.type === 'list' || f.type === 'table') out[f.key] = []
    else out[f.key] = (f.type in SCALAR_DEFAULT ? SCALAR_DEFAULT[f.type] : '')
  }
  return out
}

export function emptyRow(field) {
  const row = {}
  for (const c of field.columns || []) row[c.key] = (c.type in SCALAR_DEFAULT ? SCALAR_DEFAULT[c.type] : '')
  return row
}

/* ------------------------------------------------------------- coercion */

function toStr(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join('\n')
  if (typeof v === 'object') return Object.values(v).map(toStr).filter(Boolean).join(' — ')
  return ''
}

function toNum(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const cleaned = String(v).replace(/[^0-9.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function toDate(v) {
  const s = toStr(v)
  if (!s) return ''
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function coerce(type, v) {
  switch (type) {
    case 'number':
    case 'money':
      return toNum(v)
    case 'date':
      return toDate(v)
    default:
      return toStr(v)
  }
}

function toList(v) {
  if (v == null || v === '') return []
  const arr = Array.isArray(v) ? v : String(v).split(/\r?\n/)
  return arr.map((x) => toStr(x).replace(/^[-*•]\s+/, '')).filter(Boolean)
}

/** Coerce arbitrary (e.g. model-generated) JSON into exactly the template's shape. */
export function normalizeContent(template, raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  for (const f of template.fields) {
    const v = src[f.key]
    if (f.type === 'list') out[f.key] = toList(v)
    else if (f.type === 'table') {
      const rows = Array.isArray(v) ? v : []
      out[f.key] = rows
        .filter((r) => r && typeof r === 'object')
        .map((r) => Object.fromEntries((f.columns || []).map((c) => [c.key, coerce(c.type, r[c.key])])))
    } else out[f.key] = coerce(f.type, v)
  }
  return out
}

/* ------------------------------------------------------------- derived */

const round2 = (n) => Math.round(n * 100) / 100

/** Recompute fields that follow from others (bill amounts and totals). Pure. */
export function computeDerived(template, content) {
  if (template.id !== 'voice_bill') return content
  const items = (content.items || []).map((r) => {
    const qty = toNum(r.qty)
    const rate = toNum(r.rate)
    return { ...r, amount: qty != null && rate != null ? round2(qty * rate) : toNum(r.amount) }
  })
  const subtotal = round2(items.reduce((s, r) => s + (r.amount || 0), 0))
  const tax = toNum(content.tax) || 0
  return { ...content, items, subtotal, tax, total: round2(subtotal + tax) }
}

/* ------------------------------------------------------------ validation */

const isEmpty = (f, v) => {
  if (f.type === 'list' || f.type === 'table') return !Array.isArray(v) || v.length === 0
  if (f.type === 'number' || f.type === 'money') return v == null || v === ''
  return !String(v ?? '').trim()
}

const money = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

/**
 * Validate content against its template.
 * Errors block approval; warnings are shown to the reviewer but do not block.
 * @returns {{ ok: boolean, issues: Array<{field:string,row?:number,column?:string,level:'error'|'warning',message:string}> }}
 */
export function validateDocument(template, content = {}) {
  const issues = []
  const err = (field, message, extra = {}) => issues.push({ field, level: 'error', message, ...extra })
  const warn = (field, message, extra = {}) => issues.push({ field, level: 'warning', message, ...extra })

  for (const f of template.fields) {
    const v = content[f.key]
    if (f.required && isEmpty(f, v)) {
      err(f.key, `Add ${f.type === 'table' || f.type === 'list' ? 'at least one entry to' : 'a value for'} ${f.label}.`)
      continue
    }
    if ((f.type === 'number' || f.type === 'money') && v != null && v !== '' && !Number.isFinite(Number(v))) {
      err(f.key, `${f.label} must be a number.`)
    }
    if (f.type === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) err(f.key, `${f.label} must be a date (YYYY-MM-DD).`)
    if (f.type === 'table' && Array.isArray(v)) {
      v.forEach((row, i) => {
        for (const c of f.columns || []) {
          const cv = row?.[c.key]
          if ((c.type === 'number' || c.type === 'money') && cv != null && cv !== '') {
            if (!Number.isFinite(Number(cv))) err(f.key, `${f.label} row ${i + 1}: ${c.label} must be a number.`, { row: i, column: c.key })
            else if (Number(cv) < 0) err(f.key, `${f.label} row ${i + 1}: ${c.label} cannot be negative.`, { row: i, column: c.key })
          }
        }
      })
    }
  }

  if (template.id === 'voice_bill') {
    const items = content.items || []
    let sum = 0
    items.forEach((r, i) => {
      const name = r.item || `row ${i + 1}`
      if (!String(r.item ?? '').trim()) warn('items', `Row ${i + 1} has no item name.`, { row: i, column: 'item' })
      if (r.rate == null || r.rate === '') warn('items', `Add a rate for ${name}.`, { row: i, column: 'rate' })
      const qty = toNum(r.qty)
      const rate = toNum(r.rate)
      const amount = toNum(r.amount)
      if (qty != null && rate != null) {
        const expected = round2(qty * rate)
        if (amount == null || Math.abs(expected - amount) > 0.01) {
          warn('items', `Amount for ${name} should be ${money(expected)} (${qty} × ${money(rate)}).`, { row: i, column: 'amount' })
        }
      }
      sum += amount || 0
    })
    sum = round2(sum)
    const subtotal = toNum(content.subtotal)
    if (items.length && subtotal != null && Math.abs(subtotal - sum) > 0.01) warn('subtotal', `Subtotal should be ${money(sum)}.`)
    const total = toNum(content.total)
    const expectedTotal = round2((subtotal ?? sum) + (toNum(content.tax) || 0))
    if (total != null && Math.abs(total - expectedTotal) > 0.01) warn('total', `Total should be ${money(expectedTotal)}.`)
  }

  if (template.id === 'meeting_report') {
    ;(content.action_items || []).forEach((r, i) => {
      if (String(r.task ?? '').trim() && !String(r.owner ?? '').trim()) {
        warn('action_items', `Assign an owner to “${r.task}”.`, { row: i, column: 'owner' })
      }
    })
  }

  return { ok: !issues.some((i) => i.level === 'error'), issues }
}

/* --------------------------------------------------------------- export */

function fmt(type, v) {
  if (v == null || v === '') return ''
  if (type === 'money') return money(v)
  return String(v)
}

export function toMarkdown(template, content = {}) {
  const titleField = template.fields.find((f) => f.key === 'title' || f.key === 'bill_no')
  const heading = content.title || (content.bill_no ? `${template.name} ${content.bill_no}` : template.name)
  const lines = [`# ${heading}`, '']
  for (const f of template.fields) {
    if (f === titleField && f.key === 'title') continue
    const v = content[f.key]
    if (f.type === 'list') {
      if (!v?.length) continue
      lines.push(`## ${f.label}`, '', ...v.map((x) => `- ${x}`), '')
    } else if (f.type === 'table') {
      if (!v?.length) continue
      const cols = f.columns || []
      lines.push(`## ${f.label}`, '', `| ${cols.map((c) => c.label).join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`)
      for (const r of v) lines.push(`| ${cols.map((c) => fmt(c.type, r[c.key]).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`)
      lines.push('')
    } else if (f.type === 'longtext') {
      if (!v) continue
      lines.push(`## ${f.label}`, '', v, '')
    } else {
      if (v == null || v === '') continue
      lines.push(`**${f.label}:** ${fmt(f.type, v)}  `)
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/* ---------------------------------------------------------- JSON schema */

function scalarSchema(type, description) {
  if (type === 'number' || type === 'money') return { type: 'number', description }
  if (type === 'date') return { type: 'string', description: `${description} (YYYY-MM-DD)` }
  return { type: 'string', description }
}

/** JSON Schema for a template — handed to the model for structured output. */
export function toJsonSchema(template) {
  const properties = {}
  for (const f of template.fields) {
    if (f.type === 'list') properties[f.key] = { type: 'array', items: { type: 'string' }, description: f.label }
    else if (f.type === 'table') {
      const cols = f.columns || []
      properties[f.key] = {
        type: 'array',
        description: f.label,
        items: {
          type: 'object',
          properties: Object.fromEntries(cols.map((c) => [c.key, scalarSchema(c.type, c.label)])),
          required: cols.map((c) => c.key),
          additionalProperties: false,
        },
      }
    } else properties[f.key] = scalarSchema(f.type, f.label)
  }
  return {
    type: 'object',
    properties,
    required: template.fields.filter((f) => f.required).map((f) => f.key),
    additionalProperties: false,
  }
}
