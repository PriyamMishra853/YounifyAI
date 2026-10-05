// YouTube links → transcript text for the pipeline.
// Uses the captions YouTube already has (uploaded or auto-generated), fetched
// through youtubei.js, YouTube's own internal API. No key and no video download.
// Order of preference: uploaded English → auto English → any track translated
// to English by YouTube → the original-language track as is.

import { Innertube, Log } from 'youtubei.js'

Log.setLevel(Log.Level.NONE)

const ID = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([\w-]{11})/i

export function youtubeId(url) {
  const m = String(url || '').trim().match(ID)
  return m ? m[1] : null
}

let clientPromise = null
function client() {
  clientPromise ||= Innertube.create({ lang: 'en', location: 'IN', retrieve_player: false }).catch((e) => {
    clientPromise = null
    throw e
  })
  return clientPromise
}

export class LinkError extends Error {}

const fmtTime = (s) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** "0:00 Intro" / "12:34 - Gradient descent" lines in a description. */
export function chaptersFromDescription(description = '') {
  const out = []
  for (const line of String(description).split(/\r?\n/)) {
    const m = line.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–—:|)]?\s+(.{2,100})$/)
    if (m) out.push({ start: Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]), title: m[4].trim() })
  }
  return out.length >= 2 && out[0].start === 0 ? out : []
}

async function basicInfo(id) {
  const yt = await client()
  // the iOS client returns caption URLs that work without a browser proof-of-origin token
  for (const c of ['IOS', 'ANDROID', 'WEB']) {
    try {
      const info = await yt.getBasicInfo(id, { client: c })
      if (info?.basic_info?.title) return { info, via: c }
    } catch { /* try the next client */ }
  }
  throw new LinkError('YouTube did not return this video. Check the link, or whether the video is private or age-restricted.')
}

/** Title, channel, length, thumbnail and caption languages — for the capture preview. */
export async function youtubeInfo(url) {
  const id = youtubeId(url)
  if (!id) throw new LinkError('That is not a YouTube video link.')
  const { info } = await basicInfo(id)
  const b = info.basic_info
  const tracks = info.captions?.caption_tracks || []
  if (b.is_live_content && b.is_live) throw new LinkError('Live streams cannot be captured until they end.')
  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: b.title,
    channel: b.author || b.channel?.name || '',
    durationSeconds: b.duration || 0,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    description: b.short_description || '',
    captions: tracks.map((t) => ({ language: t.language_code, name: t.name?.text || t.language_code, auto: t.kind === 'asr' })),
    chapters: chaptersFromDescription(b.short_description),
  }
}

const decode = (s) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))

function parseCaptions(body) {
  const trimmed = body.trim()
  if (trimmed.startsWith('{')) {
    const events = JSON.parse(trimmed).events || []
    return events
      .filter((e) => e.segs)
      .map((e) => ({ start: (e.tStartMs || 0) / 1000, text: e.segs.map((s) => s.utf8 || '').join('').replace(/\s+/g, ' ').trim() }))
      .filter((s) => s.text)
  }
  // srv3: <p t="1230" d="...">…</p>   srv1: <text start="1.23" dur="…">…</text>
  const out = []
  for (const m of trimmed.matchAll(/<p\s+t="(\d+)"[^>]*>([\s\S]*?)<\/p>/g)) out.push({ start: Number(m[1]) / 1000, text: decode(m[2]).replace(/\s+/g, ' ').trim() })
  if (!out.length) for (const m of trimmed.matchAll(/<text\s+start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)) out.push({ start: Number(m[1]), text: decode(m[2]).replace(/\s+/g, ' ').trim() })
  return out.filter((s) => s.text)
}

async function fetchTrack(baseUrl, extra = '') {
  for (const fmt of ['&fmt=json3', '']) {
    const res = await fetch(`${baseUrl}${fmt}${extra}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) continue
    const body = await res.text()
    if (!body.trim()) continue
    try {
      const segs = parseCaptions(body)
      if (segs.length) return segs
    } catch { /* try the other format */ }
  }
  return []
}

function pickTracks(tracks) {
  const en = (t) => /^en/i.test(t.language_code)
  const manual = (t) => t.kind !== 'asr'
  return [
    ...tracks.filter((t) => en(t) && manual(t)).map((t) => ({ t })),
    ...tracks.filter((t) => en(t) && !manual(t)).map((t) => ({ t })),
    ...tracks.filter((t) => !en(t) && t.is_translatable !== false).map((t) => ({ t, translate: true })),
    ...tracks.filter((t) => !en(t)).map((t) => ({ t })),
  ]
}

/**
 * Transcript of a YouTube video as timestamped paragraphs, plus its metadata.
 * @returns {{ text: string, meta: object }}
 */
export async function youtubeTranscript(url) {
  const id = youtubeId(url)
  if (!id) throw new LinkError('That is not a YouTube video link.')
  const { info } = await basicInfo(id)
  const b = info.basic_info
  const tracks = info.captions?.caption_tracks || []
  if (!tracks.length) {
    throw new LinkError(`“${b.title}” has no captions on YouTube, so there is no transcript to work from. Pick a lecture with captions (CC), or upload the recording as a file.`)
  }

  let segments = []
  let used = null
  for (const choice of pickTracks(tracks)) {
    segments = await fetchTrack(choice.t.base_url, choice.translate ? '&tlang=en' : '').catch(() => [])
    if (segments.length) {
      used = { language: choice.translate ? `en (from ${choice.t.language_code})` : choice.t.language_code, auto: choice.t.kind === 'asr', translated: !!choice.translate }
      break
    }
  }
  if (!segments.length) throw new LinkError('YouTube did not return the captions for this video. Try again in a minute, or upload the recording as a file.')

  const chapters = chaptersFromDescription(b.short_description)
  const text = formatTranscript({ title: b.title, channel: b.author, durationSeconds: b.duration, chapters, description: b.short_description }, segments)
  return {
    text,
    meta: {
      source: 'youtube', videoId: id, title: b.title, channel: b.author || '', durationSeconds: b.duration || 0,
      captions: used, chapters, segments: segments.length,
    },
  }
}

/** Header + chapters + transcript grouped into ~45-second timestamped paragraphs. */
export function formatTranscript({ title, channel, durationSeconds, chapters = [], description = '' }, segments, windowSeconds = 45) {
  const lines = [`Video: ${title}`]
  if (channel) lines.push(`Channel: ${channel}`)
  if (durationSeconds) lines.push(`Length: ${fmtTime(durationSeconds)}`)
  const about = String(description).split(/\n\s*\n/)[0]?.trim()
  if (about && about.length > 40 && !/^\d{1,2}:\d{2}/.test(about)) lines.push(`Description: ${about.slice(0, 600)}`)
  if (chapters.length) lines.push(`Chapters:\n${chapters.map((c) => `[${fmtTime(c.start)}] ${c.title}`).join('\n')}`)
  lines.push('', 'Transcript:')
  let cur = null
  const paras = []
  for (const s of segments) {
    if (!cur || s.start - cur.start >= windowSeconds) {
      cur = { start: s.start, parts: [] }
      paras.push(cur)
    }
    cur.parts.push(s.text)
  }
  for (const p of paras) lines.push(`[${fmtTime(p.start)}] ${p.parts.join(' ').replace(/\s+/g, ' ').trim()}`)
  return lines.join('\n')
}
