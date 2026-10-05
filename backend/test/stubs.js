import http from 'node:http'

/** Read a request body (JSON or multipart) as a Buffer. */
const body = (req) => new Promise((resolve) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => resolve(Buffer.concat(chunks)))
})

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) })
    })
  })
}

/**
 * A fake OpenAI-compatible API (the shape Groq and OpenAI share).
 * `behaviour` decides the replies; every request is recorded in `calls`.
 */
export async function startAiStub(behaviour = {}) {
  const calls = []
  const b = {
    transcript: 'do kilo basmati chawal aur ek litre sarson ka tel',
    vision: 'BOARD\nEntropy is a measure of disorder\n---\nA whiteboard with a thermodynamics formula.',
    chat: (messages) => ({ bill_no: '0001', date: '2026-09-22', customer: 'Walk-in', items: [{ item: 'Basmati rice', qty: 2, unit: 'kg', rate: 120, amount: 240 }], tax: 0 }),
    failChat: false,
    ...behaviour,
  }
  const stub = await listen(async (req, res) => {
    const raw = await body(req)
    const call = { method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers['content-type'] }
    const send = (status, obj) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(obj))
    }
    if (req.url.endsWith('/audio/transcriptions')) {
      call.form = raw.toString('latin1')
      calls.push(call)
      return send(200, { text: b.transcript })
    }
    if (req.url.endsWith('/chat/completions')) {
      call.json = JSON.parse(raw.toString('utf8'))
      calls.push(call)
      const isVision = Array.isArray(call.json.messages.at(-1).content)
      if (isVision) return send(200, { choices: [{ message: { content: b.vision } }] })
      if (b.failChat) return send(503, { error: { message: 'model overloaded' } })
      return send(200, { choices: [{ message: { content: JSON.stringify(b.chat(call.json.messages)) } }], usage: { total_tokens: 42 } })
    }
    calls.push(call)
    send(404, { error: { message: 'no such route' } })
  })
  return { ...stub, calls, behaviour: b }
}

/** Just enough of the Qdrant REST API: collections, payload indexes, upsert, filtered search, delete. */
export async function startQdrantStub() {
  const points = []
  let collection = false
  const requests = []
  const match = (p, filter) => (filter?.must || []).every((cond) => {
    const v = p.payload[cond.key]
    return cond.match.any ? cond.match.any.includes(v) : v === cond.match.value
  })
  const cos = (a, b) => {
    let d = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2 }
    return d / (Math.sqrt(na * nb) || 1)
  }
  const stub = await listen(async (req, res) => {
    const raw = await body(req)
    const json = raw.length ? JSON.parse(raw.toString('utf8')) : null
    requests.push({ method: req.method, url: req.url, json })
    const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
    const path = req.url.split('?')[0]
    if (req.method === 'GET' && /^\/collections\/[^/]+$/.test(path)) return collection ? send(200, { result: {} }) : send(404, { status: { error: 'not found' } })
    if (req.method === 'PUT' && /^\/collections\/[^/]+$/.test(path)) { collection = true; return send(200, { result: true }) }
    if (req.method === 'PUT' && path.endsWith('/index')) return send(200, { result: {} })
    if (req.method === 'PUT' && path.endsWith('/points')) { points.push(...json.points); return send(200, { result: { status: 'completed' } }) }
    if (req.method === 'POST' && path.endsWith('/points/search')) {
      const hits = points.filter((p) => match(p, json.filter)).map((p) => ({ payload: p.payload, score: cos(p.vector, json.vector) }))
      return send(200, { result: hits.sort((x, y) => y.score - x.score).slice(0, json.limit) })
    }
    if (req.method === 'POST' && path.endsWith('/points/delete')) {
      for (let i = points.length - 1; i >= 0; i--) if (match(points[i], json.filter)) points.splice(i, 1)
      return send(200, { result: { status: 'completed' } })
    }
    send(404, { status: { error: `unhandled ${req.method} ${path}` } })
  })
  return { ...stub, points, requests }
}
