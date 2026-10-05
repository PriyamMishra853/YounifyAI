// Offline lecture notes from a timestamped transcript (YouTube captions or a
// speech-to-text result). Extractive: every sentence it writes was said in the
// lecture. Used when no language model is configured.

const STOP = new Set(('a an the and or but if then so of to in on at for with from by as is are was were be been being it its this that these those there here we you i he she they our your their us me my do does did doing have has had not no yes can could will would should may might just also very really about into over under than which what when where who whom how why all any each more most some such only own same too s t don now okay ok right going gonna get got let lets say said one two like well kind sort thing things way actually basically').split(' '))

const TS = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/

const toSeconds = (ts) => ts.split(':').map(Number).reduce((a, b) => a * 60 + b, 0)
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s)

/** Parse the block produced by formatTranscript (backend/src/ai/youtube.js). */
export function parseTranscriptBlock(text = '') {
  const lines = String(text).split(/\r?\n/)
  const head = {}
  const chapters = []
  const paras = []
  let inChapters = false
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    let m
    if ((m = line.match(/^Video:\s*(.+)$/))) head.title = m[1]
    else if ((m = line.match(/^Channel:\s*(.+)$/))) head.channel = m[1]
    else if ((m = line.match(/^Description:\s*(.+)$/))) head.description = m[1]
    else if (/^Chapters:$/.test(line)) inChapters = true
    else if (/^Transcript:$/.test(line)) inChapters = false
    else if ((m = line.match(TS))) {
      if (inChapters) chapters.push({ ts: m[1], at: toSeconds(m[1]), title: m[2] })
      else paras.push({ ts: m[1], at: toSeconds(m[1]), text: m[2] })
    }
  }
  return { ...head, chapters, paras }
}

export const looksLikeTranscript = (text) => (String(text).match(/^\[\d{1,2}:\d{2}(?::\d{2})?\]/gm) || []).length >= 3

/** Sentences with their timestamp. Auto-captions have no punctuation, so fall back to ~24-word pieces. */
function sentencesOf(paras) {
  const out = []
  for (const p of paras) {
    if (PROMO.test(p.text)) continue
    const clean = p.text.replace(/\[(music|applause|laughter)\]/gi, '').replace(/\s+/g, ' ').trim()
    let parts = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    if (parts.length === 1 && clean.split(' ').length > 30) {
      const words = clean.split(' ')
      parts = []
      for (let i = 0; i < words.length; i += 24) parts.push(words.slice(i, i + 24).join(' '))
    }
    for (const s of parts) if (s.split(' ').length >= 6 && !PROMO.test(s)) out.push({ ts: p.ts, at: p.at, text: s.trim() })
  }
  return out
}

const contentWords = (s) => (s.toLowerCase().match(/[\p{L}][\p{L}\p{N}'-]+/gu) || []).filter((w) => w.length > 2 && !STOP.has(w))

function frequencies(sentences) {
  const freq = new Map()
  for (const s of sentences) for (const w of new Set(contentWords(s.text))) freq.set(w, (freq.get(w) || 0) + 1)
  return freq
}

function rank(sentences, freq = frequencies(sentences)) {
  const words = contentWords
  return sentences.map((s, i) => {
    const ws = words(s.text)
    const score = ws.reduce((a, w) => a + Math.log(1 + (freq.get(w) || 0)), 0) / Math.pow(Math.max(ws.length, 1), 0.6)
    return { ...s, i, score }
  })
}

const DEFINITION = /^(?:so\s+|and\s+|now\s+|basically\s+)?(?:an?\s+|the\s+)?([A-Za-z][\w -]{1,40}?)\s+(?:is|are|refers to|means|is called|is defined as)\s+(.{12,220})$/i
const PROMO = /\b(subscribe|patreon|sponsor|like and share|comment below|link in the description|notification bell|merch)\b/i
const NOT_A_TERM = /^(my|our|your|his|her|their|this|that|these|those|it|there|here|what|which|who|maybe|whether|if|in|on|so|and|but|one|all|some|each|every|when|now|then|today|i|we|you)\b/i

/**
 * Lecture notes content from a transcript block. Returns fields for the
 * lecture_notes template; the caller normalizes them against the schema.
 */
export function lectureNotesFromTranscript(text, { hints = {} } = {}) {
  const t = parseTranscriptBlock(text)
  const sentences = sentencesOf(t.paras)
  const ranked = rank(sentences)
  const top = (n, from = ranked) => [...from].sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i)

  let keyPoints
  if (t.chapters.length >= 2) {
    // one point per chapter: its title and the most informative sentence said during it
    keyPoints = t.chapters.map((c, k) => {
      const end = t.chapters[k + 1]?.at ?? Infinity
      const inside = ranked.filter((s) => s.at >= c.at && s.at < end)
      const best = top(1, inside)[0]
      return `${c.title} (${c.ts})${best ? `: ${clip(best.text, 170)}` : ''}`
    })
  } else {
    keyPoints = top(8).map((s) => `${clip(s.text, 180)} (${s.ts})`)
  }

  // key concepts: terms the lecture keeps returning to, each with its clearest
  // defining sentence ("X is …") or, failing that, the shortest sentence using it
  const freq = frequencies(sentences)
  const recurring = (term) => contentWords(term).some((w) => (freq.get(w) || 0) >= 3)
  const concepts = []
  const seen = new Set()
  for (const s of ranked) {
    const m = s.text.replace(/[.!?]$/, '').match(DEFINITION)
    if (!m) continue
    const term = cap(m[1].trim().replace(/^(?:really|actually|basically|just|also|then|so)\s+/i, '').replace(/^(?:the|a|an)\s+/i, ''))
    const key = term.toLowerCase()
    if (/^question/i.test(term) || term.split(' ').length > 4 || seen.has(key) || NOT_A_TERM.test(term) || !recurring(term)) continue
    seen.add(key)
    concepts.push({ term, definition: cap(clip(m[2].trim(), 200)) })
    if (concepts.length >= 6) break
  }
  if (concepts.length < 3) {
    const topics = [...freq.entries()].filter(([w, n]) => n >= 4 && w.length > 4).sort((a, b) => b[1] - a[1]).slice(0, 12)
    for (const [w] of topics) {
      if (concepts.length >= 5) break
      if ([...seen].some((k) => k.includes(w) || w.includes(k.split(' ')[0]))) continue
      const uses = sentences.filter((x) => x.text.toLowerCase().includes(w) && x.text.split(' ').length <= 32)
      const best = uses.sort((a, b) => a.text.length - b.text.length)[Math.min(1, uses.length - 1)]
      if (!best) continue
      seen.add(w)
      concepts.push({ term: cap(w), definition: `${clip(best.text, 200)} (${best.ts})` })
    }
  }

  const summaryParts = []
  if (t.description && !/https?:\/\//.test(t.description.split(/(?<=[.?!])\s/)[0])) summaryParts.push(t.description.split(/(?<=[.?!])\s/)[0])
  summaryParts.push(...top(3).map((s) => s.text))
  const questions = [
    ...concepts.slice(0, 3).map((c) => `Explain ${c.term.toLowerCase()} in your own words.`),
    ...t.chapters.slice(1, 4).map((c) => `Summarise the part on “${c.title}” (${c.ts}).`),
  ]
  if (!questions.length) questions.push(...top(2).map((s) => `What does the lecture mean by: “${clip(s.text, 90)}”?`))

  return {
    title: hints.title || t.title || 'Lecture notes',
    course: hints.course || t.channel || '',
    summary: clip(summaryParts.join(' '), 900),
    key_points: keyPoints.slice(0, 12),
    concepts,
    questions: questions.slice(0, 6),
  }
}
