import { openAsBlob } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createExtractor } from './extract.js'
import { CONDENSE_PROMPT, buildMessages, parseJsonReply, speechHintFor } from './prompt.js'

const CONDENSE_OVER = 24_000 // characters; longer inputs are summarised in parts first
const PART = 12_000

/**
 * A provider for any OpenAI-compatible HTTP API (Groq, OpenAI, and most gateways).
 * `offline` is the fallback used when the API cannot be reached, so a capture
 * still produces a draft instead of failing.
 *
 * options: { name, baseUrl, apiKey, models: { chat, vision, transcribe, embed }, embedDims, timeoutMs, ocrCacheDir }
 */
export function createOpenAiCompatibleProvider(options, offline, log) {
  const { name, baseUrl, apiKey, embedDims = 384, timeoutMs = 120_000, prefer = {} } = options
  const models = { ...options.models }
  let resolved = null

  /**
   * Model catalogues change and accounts differ. Before the first call, check
   * which of the configured ids the account actually has and substitute an
   * available one (by `prefer`) instead of failing the capture.
   */
  async function resolveModels() {
    resolved ||= (async () => {
      let available
      try {
        const data = await call('/models', { method: 'GET' }, { attempts: 2 })
        available = (data.data || []).map((m) => m.id)
      } catch (e) {
        log?.warn({ err: e.message, provider: name }, 'could not list models; using configured ids')
        return
      }
      if (!available.length) return
      for (const role of ['chat', 'vision', 'transcribe', 'fast']) {
        const want = models[role]
        if (!want || available.includes(want)) continue
        const pick = (prefer[role] || []).flatMap((re) => available.filter((id) => re.test(id)))[0]
        if (pick) {
          log?.warn({ provider: name, role, configured: want, using: pick }, 'model not available on this account; using another')
          models[role] = pick
        } else {
          log?.warn({ provider: name, role, configured: want, available }, 'no usable model for this role')
          models[role] = role === 'vision' ? null : models[role]
        }
      }
    })()
    return resolved
  }

  async function call(route, init, { attempts = 5 } = {}) {
    let lastError
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let res
      try {
        res = await fetch(`${baseUrl}${route}`, { ...init, headers: { Authorization: `Bearer ${apiKey}`, ...init.headers }, signal: AbortSignal.timeout(timeoutMs) })
      } catch (e) {
        lastError = new Error(e.name === 'TimeoutError' ? `${name} did not answer within ${timeoutMs / 1000}s` : `${name} is unreachable (${e.message})`)
        await backoff(attempt)
        continue
      }
      if (res.ok) return res.json()
      const body = await res.text().catch(() => '')
      let message = body
      try { message = JSON.parse(body)?.error?.message || body } catch { /* not JSON */ }
      lastError = new Error(`${name} ${res.status}: ${String(message).slice(0, 300)}`)
      lastError.status = res.status
      if (res.status === 429 || res.status >= 500) {
        await backoff(attempt, Number(res.headers.get('retry-after')))
        continue
      }
      throw lastError // 4xx other than 429 will not get better by retrying
    }
    throw lastError
  }

  async function chat(messages, { model, json = false, maxTokens = 4096 } = {}) {
    await resolveModels()
    const send = (withJson) => {
      const body = { model: model || models.chat, messages, temperature: 0.1, max_tokens: maxTokens }
      if (withJson) body.response_format = { type: 'json_object' }
      return call('/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    let data
    try {
      data = await send(json)
    } catch (e) {
      // not every model supports json_object; the prompt already asks for JSON
      if (!json || !/json/i.test(e.message)) throw e
      log?.warn({ provider: name, model: model || models.chat }, 'model rejected JSON mode; retrying without it')
      data = await send(false)
    }
    return { text: data.choices?.[0]?.message?.content ?? '', usage: data.usage }
  }

  async function transcribe(filePath, { prompt = '' } = {}) {
    await resolveModels()
    const form = new FormData()
    form.set('file', await openAsBlob(filePath), path.basename(filePath))
    form.set('model', models.transcribe)
    form.set('response_format', 'json')
    if (prompt) form.set('prompt', prompt)
    const data = await call('/audio/transcriptions', { method: 'POST', body: form })
    return data.text || ''
  }

  async function see(imagePath, { prompt }) {
    await resolveModels()
    if (!models.vision) throw new Error(`${name} has no vision model on this account`)
    const buf = await fs.readFile(imagePath)
    const mime = /\.png$/i.test(imagePath) ? 'image/png' : /\.webp$/i.test(imagePath) ? 'image/webp' : 'image/jpeg'
    const { text } = await chat([
      { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${mime};base64,${buf.toString('base64')}` } }] },
    ], { model: models.vision, maxTokens: 2048 })
    return text
  }

  /**
   * Long transcripts are split on paragraph boundaries and each part turned into
   * dense notes, keeping [mm:ss] stamps; the structured pass then reads the notes.
   * Keeps every request small enough for free-tier token limits.
   */
  async function condense(text, { log }) {
    const header = text.includes('\nTranscript:\n') ? text.slice(0, text.indexOf('\nTranscript:\n')) : ''
    const body = header ? text.slice(header.length) : text
    const parts = []
    let cur = ''
    for (const para of body.split('\n')) {
      if (cur.length + para.length > PART && cur) { parts.push(cur); cur = '' }
      cur += `${para}\n`
    }
    if (cur.trim()) parts.push(cur)
    const notes = []
    for (const [i, part] of parts.entries()) {
      const r = await chat([
        { role: 'system', content: CONDENSE_PROMPT },
        { role: 'user', content: `${header ? `${header}\n\n` : ''}Part ${i + 1} of ${parts.length}:\n"""\n${part}\n"""` },
      ], { model: models.fast || models.chat, maxTokens: 1800 })
      notes.push(`Notes for part ${i + 1} of ${parts.length}:\n${r.text.trim()}`)
      log?.(`Summarised part ${i + 1} of ${parts.length}`)
    }
    return `${header}\n\nCondensed from the full transcript:\n${notes.join('\n\n')}`
  }

  const extractor = createExtractor({
    transcribe: models.transcribe ? transcribe : null,
    see: options.models.vision ? see : null,
    ocrCacheDir: options.ocrCacheDir,
    speechHint: (input) => speechHintFor(input.template),
  })

  return {
    name,
    get models() {
      return { chat: models.chat, vision: models.vision, transcribe: models.transcribe, embed: models.embed ? `${models.embed}-${embedDims}` : offline.models.embed }
    },
    resolveModels,

    extract: (input, io) => extractor(input, io),

    async embed(texts) {
      if (!models.embed) return offline.embed(texts)
      const data = await call('/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: models.embed, input: texts.map((t) => t.slice(0, 8000)), dimensions: embedDims }),
      })
      return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
    },

    async generate(input) {
      try {
        let text = input.text || ''
        if (text.length > CONDENSE_OVER) text = await condense(text, input)
        const reply = await chat(buildMessages({ ...input, text }), { json: true })
        return { content: parseJsonReply(reply.text), engine: name, model: models.chat, usage: reply.usage }
      } catch (e) {
        log?.warn({ err: e.message, provider: name }, 'generation failed; using offline rules')
        const out = await offline.generate(input)
        return { ...out, note: `${name} could not generate (${e.message}); used offline rules instead` }
      }
    },
  }
}

const backoff = (attempt, retryAfter) =>
  new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000 + 250, 60_000) : 500 * 2 ** (attempt - 1)))
