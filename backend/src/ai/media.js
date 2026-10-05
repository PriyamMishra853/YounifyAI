import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// Audio/video plumbing with the ffmpeg binary shipped by ffmpeg-static.
// Everything writes into a temp folder the caller removes with cleanup().

let ffmpegPath
async function ffmpeg() {
  if (ffmpegPath !== undefined) return ffmpegPath
  try {
    ffmpegPath = (await import('ffmpeg-static')).default || null
    if (ffmpegPath) await fs.access(ffmpegPath)
  } catch {
    ffmpegPath = null
  }
  return ffmpegPath
}

export async function hasFfmpeg() {
  return !!(await ffmpeg())
}

async function run(args, { timeoutMs = 10 * 60 * 1000 } = {}) {
  const bin = await ffmpeg()
  if (!bin) throw new Error('ffmpeg is not available')
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['-hide_banner', '-nostdin', ...args], { windowsHide: true })
    let stderr = ''
    p.stderr.on('data', (d) => { stderr += d; if (stderr.length > 200_000) stderr = stderr.slice(-100_000) })
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs)
    p.on('error', reject)
    p.on('close', (code) => {
      clearTimeout(t)
      code === 0 ? resolve(stderr) : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`))
    })
  })
}

export async function workDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'younify-media-'))
  return { dir, cleanup: () => fs.rm(dir, { recursive: true, force: true }) }
}

/** Duration in seconds, or null. ffmpeg prints it on stderr when given only an input. */
export async function probeDuration(input) {
  const out = await run(['-i', input, '-f', 'null', '-t', '0', '-']).catch((e) => e.message)
  const m = String(out).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
}

export async function hasAudioStream(input) {
  const out = await run(['-i', input, '-f', 'null', '-t', '0', '-']).catch((e) => e.message)
  return /Stream #.*Audio:/.test(String(out))
}

/**
 * Speech-ready audio: mono, 16 kHz, 32 kbit/s MP3 (about 14 MB an hour), split
 * into parts of `segmentSeconds` so each stays under speech-to-text upload limits.
 * Returns the part paths in order.
 */
export async function speechAudio(input, dir, { segmentSeconds = 1200 } = {}) {
  const pattern = path.join(dir, 'audio_%03d.mp3')
  await run(['-i', input, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', '-f', 'segment', '-segment_time', String(segmentSeconds), '-reset_timestamps', '1', pattern])
  return (await fs.readdir(dir)).filter((f) => /^audio_\d+\.mp3$/.test(f)).sort().map((f) => path.join(dir, f))
}

/** `count` evenly spaced JPEG frames (1280 px wide at most). */
export async function keyFrames(input, dir, { count = 6 } = {}) {
  const duration = (await probeDuration(input)) || 60
  const every = Math.max(duration / (count + 1), 1)
  await run(['-i', input, '-vf', `fps=1/${every.toFixed(3)},scale='min(1280,iw)':-2`, '-frames:v', String(count), '-q:v', '3', path.join(dir, 'frame_%02d.jpg')])
  const frames = (await fs.readdir(dir)).filter((f) => /^frame_\d+\.jpg$/.test(f)).sort()
  return frames.map((f, i) => ({ path: path.join(dir, f), atSeconds: Math.round(every * (i + 1)) }))
}

/** Test helper: a short synthetic video with a tone, made by ffmpeg itself. */
export async function makeTestVideo(out, seconds = 4) {
  await run(['-f', 'lavfi', '-i', `testsrc=size=320x240:rate=10:duration=${seconds}`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-shortest', '-c:v', 'mpeg4', '-c:a', 'aac', '-y', out])
  return out
}
