import fs from 'node:fs/promises'
import { hasAudioStream, keyFrames, speechAudio, workDir } from './media.js'
import { LinkError, youtubeTranscript } from './youtube.js'

// Stage 2 (Extract): every input becomes text.
// Parsers for documents are deterministic and shared by all providers. Speech
// and vision come from the provider when it has them; OCR (tesseract) is the
// offline stand-in for vision.

const TEXT_FILE = /^text\/|\/(json|csv|xml|markdown)$|\.(txt|md|csv|json|srt|vtt)$/i
const PDF = /pdf$|\.pdf$/i
const DOCX = /wordprocessingml|\.docx$/i
const PPTX = /presentationml|\.pptx$/i

/* ------------------------------------------------------------- documents */

export async function pdfText(buf) {
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buf))
  const { text, totalPages } = await extractText(pdf, { mergePages: false })
  const pages = Array.isArray(text) ? text : [text]
  return { text: pages.map((t, i) => (pages.length > 1 ? `[Page ${i + 1}]\n${t}` : t)).join('\n\n'), meta: { pages: totalPages } }
}

export async function docxText(buf) {
  const mammoth = await import('mammoth')
  const r = await mammoth.extractRawText({ buffer: buf })
  return { text: r.value, meta: {} }
}

const xmlDecode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

export async function pptxText(buf) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buf)
  const slides = Object.keys(zip.files)
    .map((name) => ({ name, n: Number(name.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]) }))
    .filter((s) => s.n)
    .sort((a, b) => a.n - b.n)
  const parts = []
  for (const s of slides) {
    const xml = await zip.file(s.name).async('string')
    const paras = xml.split(/<\/a:p>/).map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => xmlDecode(m[1])).join('')).filter((t) => t.trim())
    if (paras.length) parts.push(`[Slide ${s.n}]\n${paras.join('\n')}`)
  }
  return { text: parts.join('\n\n'), meta: { slides: slides.length } }
}

/* ------------------------------------------------------------------- OCR */

let ocrWorker = null
/** Tesseract OCR, English + Hindi. Language data is downloaded once into the cache folder. */
export async function ocr(image, { cacheDir } = {}) {
  if (!ocrWorker) {
    const { createWorker } = await import('tesseract.js')
    if (cacheDir) await fs.mkdir(cacheDir, { recursive: true })
    ocrWorker = await createWorker(['eng', 'hin'], 1, { cachePath: cacheDir, logger: () => {} })
  }
  const { data } = await ocrWorker.recognize(image)
  return { text: data.text || '', confidence: Math.round(data.confidence || 0) }
}
export async function stopOcr() {
  await ocrWorker?.terminate()
  ocrWorker = null
}

/* -------------------------------------------------------------- extractor */

/**
 * Build an extractor. `transcribe(filePath, { prompt })` and `see(imagePath, { prompt })`
 * are the provider's speech and vision functions, or null when it has none.
 * extract(input, io) → { text, engine, meta?, note? }
 *   input: a job_inputs row (kind, name, mime, text_content, storage_key)
 *   io:    { readFile(), localPath }
 */
export function createExtractor({ transcribe = null, see = null, ocrCacheDir = null, speechHint = () => '' } = {}) {
  const ocrOrVision = async (imagePath, label) => {
    if (see) {
      try {
        const text = await see(imagePath, { prompt: VISION_PROMPT })
        return { text, engine: 'vision' }
      } catch (e) {
        const r = await ocr(imagePath, { cacheDir: ocrCacheDir })
        return { text: r.text, engine: 'ocr', note: `${label}: vision failed (${e.message}); used OCR` }
      }
    }
    const r = await ocr(imagePath, { cacheDir: ocrCacheDir })
    return { text: r.confidence >= 35 ? r.text : '', engine: 'ocr', meta: { confidence: r.confidence }, note: r.confidence < 35 ? `${label}: OCR could not read this image clearly (${r.confidence}% confidence)` : undefined }
  }

  const speech = async (filePath, input) => {
    const { dir, cleanup } = await workDir()
    try {
      const parts = await speechAudio(filePath, dir)
      const texts = []
      for (const p of parts) texts.push(await transcribe(p, { prompt: speechHint(input) }))
      return texts.join('\n').trim()
    } finally {
      await cleanup()
    }
  }

  return async function extract(input, io) {
    if (input.text_content != null) return { text: input.text_content, engine: 'direct' }
    if (input.source_url) {
      try {
        const { text, meta } = await youtubeTranscript(input.source_url)
        const how = meta.captions.translated ? `YouTube captions, translated ${meta.captions.language}` : `YouTube ${meta.captions.auto ? 'auto-generated' : 'uploaded'} captions (${meta.captions.language})`
        return { text, engine: how, meta }
      } catch (e) {
        return { text: '', engine: 'youtube', note: e instanceof LinkError ? e.message : `YouTube could not be reached (${e.message.slice(0, 120)}). Check the internet connection and try again.` }
      }
    }
    const name = input.name || ''
    const mime = input.mime || ''

    if (TEXT_FILE.test(mime) || TEXT_FILE.test(name)) return { text: (await io.readFile()).toString('utf8'), engine: 'text-file' }
    if (PDF.test(mime) || PDF.test(name)) {
      const r = await pdfText(await io.readFile())
      if (r.text.replace(/\[Page \d+\]/g, '').trim().length < 20) return { text: '', engine: 'pdf', meta: r.meta, note: `${name}: this PDF has no text layer (a scan). Upload the pages as images instead.` }
      return { ...r, engine: 'pdf' }
    }
    if (DOCX.test(mime) || DOCX.test(name)) return { ...(await docxText(await io.readFile())), engine: 'docx' }
    if (PPTX.test(mime) || PPTX.test(name)) return { ...(await pptxText(await io.readFile())), engine: 'pptx' }

    if (input.kind === 'image') {
      const r = await ocrOrVision(io.localPath, name)
      return { ...r, text: r.text.trim() }
    }

    if (input.kind === 'voice') {
      if (!transcribe) return { text: '', engine: 'none', note: `${name}: speech to text needs an AI provider` }
      return { text: await speech(io.localPath, input), engine: 'speech-to-text' }
    }

    if (input.kind === 'video') {
      const out = []
      const notes = []
      if (transcribe && (await hasAudioStream(io.localPath))) out.push(`[Audio transcript]\n${await speech(io.localPath, input)}`)
      else if (!transcribe) notes.push('audio needs an AI provider')
      const { dir, cleanup } = await workDir()
      try {
        const frames = await keyFrames(io.localPath, dir, { count: see ? 4 : 6 })
        const seen = []
        for (const f of frames) {
          const r = await ocrOrVision(f.path, `${name} @${f.atSeconds}s`)
          if (r.text.trim()) seen.push(`(${Math.floor(f.atSeconds / 60)}:${String(f.atSeconds % 60).padStart(2, '0')}) ${r.text.trim()}`)
        }
        if (seen.length) out.push(`[On screen]\n${dedupe(seen).join('\n')}`)
      } finally {
        await cleanup()
      }
      return { text: out.join('\n\n'), engine: transcribe ? 'speech-to-text + frames' : 'frames-ocr', note: notes.length ? `${name}: ${notes.join('; ')}` : undefined }
    }

    return { text: '', engine: 'none', note: `${name}: this file type cannot be read` }
  }
}

// consecutive frames of the same slide produce the same text; keep one
function dedupe(lines) {
  const out = []
  for (const l of lines) {
    const body = l.replace(/^\(\d+:\d+\)\s*/, '')
    if (!out.some((o) => o.replace(/^\(\d+:\d+\)\s*/, '') === body)) out.push(l)
  }
  return out
}

export const VISION_PROMPT = `Transcribe every piece of readable text in this image exactly, keeping line breaks (tables as rows with " | " between cells).
Then, under a line "---", describe in 1-3 sentences what the image shows that would matter for notes or records (diagrams, handwriting, receipts, places).
Do not add anything that is not visible.`
