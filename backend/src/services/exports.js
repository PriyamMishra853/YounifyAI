import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx'
import { toMarkdown } from '@younifyai/shared'

const require = createRequire(import.meta.url)
const NOTO = path.join(path.dirname(require.resolve('@fontsource/noto-sans/package.json')), 'files')

const inr = (n) => (n == null || n === '' ? '' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`)
const fmt = (type, v) => (v == null || v === '' ? '' : type === 'money' ? inr(v) : String(v))
const isNum = (t) => t === 'number' || t === 'money'

export function exportFileName(title, ext) {
  const base = String(title).normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'document'
  return `${base}.${ext}`
}

const heading = (doc) => doc.content?.title || (doc.content?.bill_no ? `${doc.templateName} #${doc.content.bill_no}` : doc.title)

/* --------------------------------------------------------------------- PDF */

// Noto Sans split by Unicode range: Latin, Latin-ext (has ₹), Devanagari (Hindi in
// transcripts), Greek (δ, Δ, π in lecture notes). Fallback order = FONT_ORDER.
const FONT_FILES = {
  latin: 'noto-sans-latin', ext: 'noto-sans-latin-ext', deva: 'noto-sans-devanagari', greek: 'noto-sans-greek',
}
const FONT_ORDER = ['latin', 'ext', 'deva', 'greek']
let fontBuffers = null
function loadFonts() {
  if (fontBuffers) return fontBuffers
  fontBuffers = {}
  for (const [key, base] of Object.entries(FONT_FILES)) {
    for (const w of [400, 700]) fontBuffers[`${key}-${w}`] = fs.readFileSync(path.join(NOTO, `${base}-${w}-normal.woff`))
  }
  return fontBuffers
}

function createPdf() {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 64, left: 56, right: 56 }, bufferPages: true, info: { Producer: 'YounifyAI' } })
  const bufs = loadFonts()
  for (const [name, buf] of Object.entries(bufs)) doc.registerFont(name, buf)
  const glyphCache = new Map()
  const fontFor = (cp, weight) => {
    const k = `${cp}-${weight}`
    if (!glyphCache.has(k)) {
      let pick = `latin-${weight}`
      for (const key of FONT_ORDER) {
        doc.font(`${key}-${weight}`)
        if (doc._font.font.hasGlyphForCodePoint(cp)) { pick = `${key}-${weight}`; break }
      }
      glyphCache.set(k, pick)
    }
    return glyphCache.get(k)
  }
  /** Write text that may mix Latin, ₹, Greek and Devanagari, switching fonts per run. */
  doc.rich = (text, x, y, opts = {}, weight = 400) => {
    const s = String(text ?? '')
    const segs = []
    for (const ch of s) {
      const f = /\s/.test(ch) && segs.length ? segs[segs.length - 1].font : fontFor(ch.codePointAt(0), weight)
      if (segs.length && segs[segs.length - 1].font === f) segs[segs.length - 1].text += ch
      else segs.push({ font: f, text: ch })
    }
    if (!segs.length) segs.push({ font: `latin-${weight}`, text: '' })
    // pdfkit mis-places `continued` runs when aligned right or centre, so a short
    // mixed-font line (e.g. "₹240" in a table cell) is measured and placed by hand
    if (segs.length > 1 && x != null && opts.width && (opts.align === 'right' || opts.align === 'center')) {
      const widths = segs.map((seg) => doc.font(seg.font).widthOfString(seg.text, opts))
      const total = widths.reduce((a, b) => a + b, 0)
      if (total <= opts.width) {
        let cx = x + (opts.align === 'right' ? opts.width - total : (opts.width - total) / 2)
        const top = y ?? doc.y
        segs.forEach((seg, i) => {
          doc.font(seg.font).text(seg.text, cx, top, { lineBreak: false, characterSpacing: opts.characterSpacing })
          cx += widths[i]
        })
        doc.x = x
        doc.y = top + doc.currentLineHeight(true)
        return doc
      }
    }
    segs.forEach((seg, i) => {
      doc.font(seg.font)
      const more = i < segs.length - 1
      if (i === 0 && x != null) doc.text(seg.text, x, y, { ...opts, continued: more })
      else doc.text(seg.text, { ...opts, continued: more })
    })
    return doc
  }
  return doc
}

const INK = '#16202A'
const SLATE = '#56667A'
const RULE = '#D9E1EA'

function pdfLabel(doc, text) {
  doc.fillColor(SLATE).fontSize(8).rich(text.toUpperCase(), undefined, undefined, { characterSpacing: 0.8 }, 700)
  doc.moveDown(0.3).fillColor(INK)
}

function ensureSpace(doc, h) {
  if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage()
}

function pdfTable(doc, field, rows, template, content) {
  const cols = field.columns || []
  const left = doc.page.margins.left
  const width = doc.page.width - left - doc.page.margins.right
  const fixed = cols.filter((c) => isNum(c.type)).length * 72
  const flex = cols.filter((c) => !isNum(c.type)).length || 1
  const widths = cols.map((c) => (isNum(c.type) ? 72 : (width - fixed) / flex))
  const pad = 5

  const drawRow = (cells, { head = false } = {}) => {
    doc.fontSize(head ? 8 : 9.5)
    const heights = cells.map((t, i) => doc.heightOfString(t || ' ', { width: widths[i] - pad * 2 }))
    const h = Math.max(...heights) + pad * 2
    ensureSpace(doc, h + 4)
    const y = doc.y
    if (head) doc.rect(left, y, width, h).fill('#F1F4F8')
    let x = left
    cells.forEach((t, i) => {
      doc.fillColor(head ? SLATE : INK)
      doc.rich(t, x + pad, y + pad, { width: widths[i] - pad * 2, align: isNum(cols[i].type) ? 'right' : 'left' }, head ? 700 : 400)
      x += widths[i]
    })
    doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.6).strokeColor(RULE).stroke()
    doc.x = left
    doc.y = y + h
  }

  drawRow(cols.map((c) => c.label), { head: true })
  for (const r of rows) drawRow(cols.map((c) => fmt(c.type, r[c.key])))

  if (template.id === 'voice_bill' && field.key === 'items') {
    doc.moveDown(0.5)
    const totals = [['Subtotal', content.subtotal], ...(content.tax ? [['Tax', content.tax]] : []), ['Total', content.total]]
    for (const [label, v] of totals) {
      const bold = label === 'Total'
      ensureSpace(doc, 18)
      const y = doc.y
      doc.fillColor(bold ? INK : SLATE).fontSize(bold ? 12 : 10)
      doc.rich(label, left + width - 220, y, { width: 120, align: 'right' }, bold ? 700 : 400)
      doc.rich(inr(v), left + width - 95, y, { width: 95, align: 'right' }, bold ? 700 : 400)
      doc.x = left
      doc.y = y + (bold ? 18 : 15)
    }
  }
  doc.moveDown(0.8)
}

export function renderPdf(template, doc) {
  const pdf = createPdf()
  const done = new Promise((resolve, reject) => {
    const chunks = []
    pdf.on('data', (c) => chunks.push(c))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)
  })
  const c = doc.content || {}
  const left = pdf.page.margins.left

  pdf.fillColor(SLATE).fontSize(8).rich(template.name.toUpperCase(), left, 56, { characterSpacing: 1 }, 700)
  pdf.moveDown(0.4).fillColor(INK).fontSize(22).rich(heading(doc), undefined, undefined, {}, 700)
  pdf.moveDown(0.3).fillColor(SLATE).fontSize(9)
  const status = doc.status === 'approved'
    ? `Approved${doc.approvedBy ? ` by ${doc.approvedBy.name}` : ''} on ${new Date(doc.approvedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'Draft: not yet approved'
  pdf.rich(`${status} · version ${doc.version}`)
  pdf.moveDown(0.8)

  const scalars = template.fields.filter((f) => ['text', 'date', 'number', 'money'].includes(f.type) && f.key !== 'title'
    && !(template.id === 'voice_bill' && ['subtotal', 'tax', 'total'].includes(f.key)))
  if (scalars.length) {
    const width = pdf.page.width - left * 2
    const colW = width / 3
    for (let i = 0; i < scalars.length; i += 3) {
      const y = pdf.y
      let rowH = 0
      scalars.slice(i, i + 3).forEach((f, k) => {
        pdf.fillColor(SLATE).fontSize(7.5).rich(f.label.toUpperCase(), left + k * colW, y, { width: colW - 10, characterSpacing: 0.6 }, 700)
        pdf.fillColor(INK).fontSize(10.5).rich(fmt(f.type, c[f.key]) || '—', left + k * colW, y + 11, { width: colW - 10 })
        rowH = Math.max(rowH, pdf.y - y)
      })
      pdf.x = left
      pdf.y = y + rowH + 8
    }
    pdf.moveTo(left, pdf.y).lineTo(pdf.page.width - left, pdf.y).lineWidth(0.6).strokeColor(RULE).stroke()
    pdf.moveDown(1)
  }

  for (const f of template.fields) {
    const v = c[f.key]
    if (f.type === 'longtext' && v) {
      ensureSpace(pdf, 40)
      pdfLabel(pdf, f.label)
      pdf.fontSize(10.5).rich(v, left, undefined, { lineGap: 2.5 })
      pdf.moveDown(1)
    } else if (f.type === 'list' && v?.length) {
      ensureSpace(pdf, 40)
      pdfLabel(pdf, f.label)
      for (const item of v) {
        ensureSpace(pdf, 16)
        const y = pdf.y
        pdf.circle(left + 3, y + 6.5, 1.8).fill('#F4A900')
        pdf.fillColor(INK).fontSize(10.5).rich(item, left + 14, y, { width: pdf.page.width - left * 2 - 14, lineGap: 2 })
        pdf.moveDown(0.25)
      }
      pdf.x = left
      pdf.moveDown(0.8)
    } else if (f.type === 'table' && v?.length) {
      ensureSpace(pdf, 60)
      pdfLabel(pdf, f.label)
      pdfTable(pdf, f, v, template, c)
    }
  }

  const range = pdf.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i)
    pdf.page.margins.bottom = 0 // the footer sits below the text area; don't let it start a new page
    const y = pdf.page.height - 40
    pdf.fillColor(SLATE).fontSize(7.5)
    pdf.rich(`YounifyAI · ${doc.title} · v${doc.version}`, left, y, { width: 360, lineBreak: false })
    pdf.rich(`Page ${i + 1} of ${range.count}`, pdf.page.width - left - 120, y, { width: 120, align: 'right', lineBreak: false })
  }
  pdf.end()
  return done
}

/* -------------------------------------------------------------------- DOCX */

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: 'D9E1EA' }

function docxLabel(text) {
  return new Paragraph({ spacing: { before: 240, after: 80 }, children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 16, color: '56667A', characterSpacing: 20 })] })
}

export async function renderDocx(template, doc) {
  const c = doc.content || {}
  const children = [
    new Paragraph({ children: [new TextRun({ text: template.name.toUpperCase(), bold: true, size: 16, color: '56667A', characterSpacing: 30 })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [new TextRun({ text: heading(doc), bold: true, size: 44, color: '16202A' })] }),
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: `${doc.status === 'approved' ? `Approved${doc.approvedBy ? ` by ${doc.approvedBy.name}` : ''}` : 'Draft: not yet approved'} · version ${doc.version}`, size: 18, color: '56667A' })],
    }),
  ]
  for (const f of template.fields) {
    if (f.key === 'title') continue
    const v = c[f.key]
    if (['text', 'date', 'number', 'money'].includes(f.type)) {
      if (v == null || v === '') continue
      children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `${f.label}: `, bold: true, size: 20 }), new TextRun({ text: fmt(f.type, v), size: 20 })] }))
    } else if (f.type === 'longtext' && v) {
      children.push(docxLabel(f.label))
      for (const para of String(v).split(/\n{2,}/)) children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: para, size: 21 })] }))
    } else if (f.type === 'list' && v?.length) {
      children.push(docxLabel(f.label))
      for (const item of v) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: item, size: 21 })] }))
    } else if (f.type === 'table' && v?.length) {
      children.push(docxLabel(f.label))
      const cols = f.columns || []
      const cell = (text, { head = false, right = false } = {}) => new TableCell({
        borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
        shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F4F8' } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text, bold: head, size: head ? 17 : 20, color: head ? '56667A' : '16202A' })] })],
      })
      const rows = [
        new TableRow({ tableHeader: true, children: cols.map((col) => cell(col.label, { head: true, right: isNum(col.type) })) }),
        ...v.map((r) => new TableRow({ children: cols.map((col) => cell(fmt(col.type, r[col.key]), { right: isNum(col.type) })) })),
      ]
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }))
      if (template.id === 'voice_bill' && f.key === 'items') {
        for (const [label, val] of [['Subtotal', c.subtotal], ...(c.tax ? [['Tax', c.tax]] : []), ['Total', c.total]]) {
          children.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 60 }, children: [new TextRun({ text: `${label}: ${inr(val)}`, bold: label === 'Total', size: label === 'Total' ? 24 : 20 })] }))
        }
      }
    }
  }
  const file = new Document({
    creator: 'YounifyAI',
    title: doc.title,
    styles: { default: { document: { run: { font: 'Calibri' } } } },
    sections: [{ children }],
  })
  return Packer.toBuffer(file)
}

/* ------------------------------------------------------------------ switch */

export async function renderExport(template, doc, format) {
  switch (format) {
    case 'md':
      return { body: Buffer.from(toMarkdown(template, doc.content)), mime: 'text/markdown; charset=utf-8', filename: exportFileName(doc.title, 'md') }
    case 'json':
      return {
        body: Buffer.from(JSON.stringify({ template: { id: template.id, name: template.name }, title: doc.title, status: doc.status, version: doc.version, approvedAt: doc.approvedAt, content: doc.content }, null, 2)),
        mime: 'application/json; charset=utf-8',
        filename: exportFileName(doc.title, 'json'),
      }
    case 'pdf':
      return { body: await renderPdf(template, doc), mime: 'application/pdf', filename: exportFileName(doc.title, 'pdf') }
    case 'docx':
      return { body: await renderDocx(template, doc), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: exportFileName(doc.title, 'docx') }
    default:
      throw new Error(`unknown format ${format}`)
  }
}
