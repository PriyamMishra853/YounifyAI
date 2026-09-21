import * as THREE from 'three'

// Every texture in the hero is drawn here with Canvas 2D: no image downloads,
// and the artwork stays in the product's own vocabulary (inputs vs. documents).

const MONO = '"Martian Mono Variable", ui-monospace, monospace'
const SANS = '"Hanken Grotesk Variable", system-ui, sans-serif'

function make(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  draw(ctx, w, h)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

// deterministic pseudo-random so every load draws the same art
function rng(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/* ------------------------------------------------------------ input shards */

const SHARD = { w: 384, h: 288 }

function shardBase(ctx, w, h, color, label) {
  rr(ctx, 3, 3, w - 6, h - 6, 28)
  ctx.fillStyle = 'rgba(13, 43, 69, 0.94)'
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.fillStyle = 'rgba(143,163,184,0.95)'
  ctx.font = `600 19px ${MONO}`
  ctx.fillText(label, 26, 44)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(w - 34, 37, 7, 0, Math.PI * 2)
  ctx.fill()
}

const drawers = {
  voice(ctx, w, h, color) {
    shardBase(ctx, w, h, color, 'voice_note.m4a')
    const r = rng(7)
    const bars = 30
    const mid = h / 2 + 18
    const gap = (w - 60) / bars
    ctx.fillStyle = color
    for (let i = 0; i < bars; i++) {
      const env = Math.sin((i / (bars - 1)) * Math.PI)
      const bh = 12 + env * (40 + r() * 70)
      rr(ctx, 30 + i * gap, mid - bh / 2, gap * 0.55, bh, 4)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(238,242,246,0.7)'
    ctx.font = `500 17px ${MONO}`
    ctx.fillText('0:18', 26, h - 26)
  },
  video(ctx, w, h, color) {
    shardBase(ctx, w, h, color, 'lecture_03.mp4')
    const fx = 30, fy = 70, fw = w - 60, fh = h - 118
    rr(ctx, fx, fy, fw, fh, 14)
    ctx.fillStyle = 'rgba(217,90,90,0.16)'
    ctx.fill()
    ctx.fillStyle = color
    for (let i = 0; i < 9; i++) {
      rr(ctx, fx + 14 + i * ((fw - 28) / 9), fy + 10, 18, 10, 3); ctx.fill()
      rr(ctx, fx + 14 + i * ((fw - 28) / 9), fy + fh - 20, 18, 10, 3); ctx.fill()
    }
    ctx.beginPath()
    const cx = w / 2, cy = fy + fh / 2
    ctx.moveTo(cx - 20, cy - 26)
    ctx.lineTo(cx + 28, cy)
    ctx.lineTo(cx - 20, cy + 26)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(238,242,246,0.7)'
    ctx.font = `500 17px ${MONO}`
    ctx.fillText('47:12', 26, h - 18)
  },
  image(ctx, w, h, color) {
    shardBase(ctx, w, h, color, 'IMG_2041.jpg')
    const fx = 30, fy = 70, fw = w - 60, fh = h - 100
    rr(ctx, fx, fy, fw, fh, 14)
    ctx.fillStyle = 'rgba(31,157,118,0.18)'
    ctx.fill()
    ctx.save()
    rr(ctx, fx, fy, fw, fh, 14)
    ctx.clip()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(fx + fw - 64, fy + 50, 22, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(fx - 10, fy + fh)
    ctx.lineTo(fx + fw * 0.34, fy + fh * 0.36)
    ctx.lineTo(fx + fw * 0.62, fy + fh)
    ctx.fill()
    ctx.globalAlpha = 0.6
    ctx.beginPath()
    ctx.moveTo(fx + fw * 0.4, fy + fh)
    ctx.lineTo(fx + fw * 0.7, fy + fh * 0.52)
    ctx.lineTo(fx + fw + 10, fy + fh)
    ctx.fill()
    ctx.restore()
  },
  text(ctx, w, h, color) {
    shardBase(ctx, w, h, color, 'team_chat.txt')
    ctx.fillStyle = 'rgba(45,108,223,0.25)'
    rr(ctx, 30, 72, w * 0.62, 78, 18); ctx.fill()
    ctx.fillStyle = color
    rr(ctx, w * 0.36, 166, w * 0.64 - 30, 58, 18); ctx.fill()
    ctx.fillStyle = 'rgba(238,242,246,0.85)'
    rr(ctx, 50, 92, w * 0.48, 10, 5); ctx.fill()
    rr(ctx, 50, 116, w * 0.32, 10, 5); ctx.fill()
    ctx.fillStyle = 'rgba(7,24,42,0.8)'
    rr(ctx, w * 0.36 + 22, 190, w * 0.36, 10, 5); ctx.fill()
  },
  docs(ctx, w, h, color) {
    shardBase(ctx, w, h, color, 'syllabus.pdf')
    const px = w / 2 - 70, py = 66, pw = 140, ph = h - 96
    ctx.fillStyle = 'rgba(244,169,0,0.16)'
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(px + pw - 30, py)
    ctx.lineTo(px + pw, py + 30)
    ctx.lineTo(px + pw, py + ph)
    ctx.lineTo(px, py + ph)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = color
    for (let i = 0; i < 6; i++) {
      rr(ctx, px + 18, py + 42 + i * 24, (i % 3 === 2 ? 60 : 100), 8, 4)
      ctx.fill()
    }
  },
}

export function createShardTextures(modalities) {
  const out = {}
  for (const m of modalities) {
    out[m.key] = make(SHARD.w, SHARD.h, (ctx, w, h) => drawers[m.key](ctx, w, h, m.hex))
  }
  return out
}
export const SHARD_ASPECT = SHARD.w / SHARD.h

/* ----------------------------------------------------------- output sheets */

const SHEET = { w: 480, h: 640 }
const INK = '#16202A'
const SLATE = '#56667A'
const RULE = '#DCE3EA'

function sheetBase(ctx, w, h, kind, title) {
  ctx.fillStyle = '#F7F9FB'
  rr(ctx, 0, 0, w, h, 22)
  ctx.fill()
  ctx.fillStyle = SLATE
  ctx.font = `600 15px ${MONO}`
  ctx.fillText(kind, 34, 50)
  ctx.fillStyle = INK
  ctx.font = `700 34px ${SANS}`
  ctx.fillText(title, 34, 98)
  ctx.strokeStyle = RULE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(34, 122)
  ctx.lineTo(w - 34, 122)
  ctx.stroke()
}

function stamp(ctx, x, y) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.18)
  ctx.strokeStyle = '#F4A900'
  ctx.lineWidth = 4
  rr(ctx, -74, -22, 148, 44, 10)
  ctx.stroke()
  ctx.fillStyle = '#B07A00'
  ctx.font = `700 17px ${MONO}`
  ctx.textAlign = 'center'
  ctx.fillText('APPROVED', 0, 7)
  ctx.restore()
}

function lines(ctx, x, y, widths, gap = 26) {
  ctx.fillStyle = '#C9D3DE'
  widths.forEach((lw, i) => {
    rr(ctx, x, y + i * gap, lw, 9, 4.5)
    ctx.fill()
  })
}

function label(ctx, text, x, y) {
  ctx.fillStyle = SLATE
  ctx.font = `600 13px ${MONO}`
  ctx.fillText(text, x, y)
}

const sheetDrawers = {
  notes(ctx, w, h) {
    sheetBase(ctx, w, h, 'LECTURE NOTES', 'Thermodynamics 03')
    label(ctx, 'SUMMARY', 34, 160)
    lines(ctx, 34, 176, [380, 400, 310])
    label(ctx, 'KEY CONCEPTS', 34, 288)
    const rows = [['Entropy', 'Measure of disorder'], ['Enthalpy', 'Heat at const. pressure'], ['Carnot', 'Max efficiency cycle']]
    rows.forEach(([a, b], i) => {
      const y = 304 + i * 44
      ctx.strokeStyle = RULE
      ctx.strokeRect(34, y, w - 68, 44)
      ctx.fillStyle = INK
      ctx.font = `700 17px ${SANS}`
      ctx.fillText(a, 48, y + 28)
      ctx.fillStyle = SLATE
      ctx.font = `500 16px ${SANS}`
      ctx.fillText(b, 190, y + 28)
    })
    label(ctx, 'REVISION QUESTIONS', 34, 470)
    lines(ctx, 34, 488, [360, 300, 330])
    stamp(ctx, w - 120, h - 52)
  },
  report(ctx, w, h) {
    sheetBase(ctx, w, h, 'MEETING REPORT', 'Weekly ops sync')
    label(ctx, 'DECISIONS', 34, 160)
    lines(ctx, 34, 176, [390, 330])
    label(ctx, 'ACTION ITEMS', 34, 262)
    const items = [['Update stock sheet', 'Ravi'], ['Send vendor quote', 'Anu'], ['Fix shift roster', 'Dev']]
    items.forEach(([t, o], i) => {
      const y = 282 + i * 52
      ctx.strokeStyle = '#8FA3B8'
      ctx.lineWidth = 2.5
      rr(ctx, 34, y, 22, 22, 5)
      ctx.stroke()
      ctx.fillStyle = INK
      ctx.font = `600 18px ${SANS}`
      ctx.fillText(t, 70, y + 18)
      ctx.fillStyle = '#E8EEF4'
      rr(ctx, w - 118, y - 2, 84, 26, 13)
      ctx.fill()
      ctx.fillStyle = SLATE
      ctx.font = `600 13px ${MONO}`
      ctx.fillText(o, w - 104, y + 16)
    })
    label(ctx, 'RISKS', 34, 460)
    lines(ctx, 34, 478, [340, 250])
    stamp(ctx, w - 120, h - 52)
  },
  diary(ctx, w, h) {
    sheetBase(ctx, w, h, 'JOURNEY DIARY', 'Rishikesh, day 2')
    ctx.fillStyle = 'rgba(31,157,118,0.18)'
    rr(ctx, 34, 144, w - 68, 150, 14)
    ctx.fill()
    ctx.fillStyle = '#1F9D76'
    ctx.beginPath()
    ctx.moveTo(34, 294); ctx.lineTo(160, 190); ctx.lineTo(280, 294); ctx.fill()
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    ctx.moveTo(200, 294); ctx.lineTo(330, 210); ctx.lineTo(w - 34, 294); ctx.fill()
    ctx.globalAlpha = 1
    label(ctx, 'MOMENTS', 34, 330)
    ;[['06:10', 'Sunrise at the ghat'], ['11:30', 'Crossed Laxman Jhula'], ['19:00', 'Evening aarti']].forEach(([t, m], i) => {
      const y = 360 + i * 40
      ctx.fillStyle = SLATE
      ctx.font = `600 14px ${MONO}`
      ctx.fillText(t, 34, y)
      ctx.fillStyle = INK
      ctx.font = `500 18px ${SANS}`
      ctx.fillText(m, 110, y)
    })
    lines(ctx, 34, 500, [380, 360, 220])
    stamp(ctx, w - 120, h - 52)
  },
  bill(ctx, w, h) {
    sheetBase(ctx, w, h, 'VOICE BILL', 'Bill #0412')
    const rows = [['Basmati rice', '2 kg', '240'], ['Mustard oil', '1 L', '180'], ['Biscuits', '5 pc', '50']]
    label(ctx, 'ITEM', 34, 160); label(ctx, 'QTY', 250, 160); label(ctx, '₹', w - 60, 160)
    rows.forEach(([a, q, amt], i) => {
      const y = 200 + i * 48
      ctx.fillStyle = INK
      ctx.font = `600 19px ${SANS}`
      ctx.fillText(a, 34, y)
      ctx.fillStyle = SLATE
      ctx.font = `500 16px ${MONO}`
      ctx.fillText(q, 250, y)
      ctx.fillStyle = INK
      ctx.textAlign = 'right'
      ctx.font = `600 18px ${MONO}`
      ctx.fillText(amt, w - 34, y)
      ctx.textAlign = 'left'
      ctx.strokeStyle = RULE
      ctx.beginPath(); ctx.moveTo(34, y + 18); ctx.lineTo(w - 34, y + 18); ctx.stroke()
    })
    ctx.fillStyle = 'rgba(244,169,0,0.2)'
    rr(ctx, 34, 360, w - 68, 60, 12)
    ctx.fill()
    ctx.fillStyle = INK
    ctx.font = `800 24px ${SANS}`
    ctx.fillText('Total', 54, 399)
    ctx.textAlign = 'right'
    ctx.font = `700 24px ${MONO}`
    ctx.fillText('₹470', w - 54, 399)
    ctx.textAlign = 'left'
    lines(ctx, 34, 460, [300, 220])
    stamp(ctx, w - 120, h - 52)
  },
}

export const SHEET_KINDS = ['notes', 'report', 'diary', 'bill']
export function createSheetTextures() {
  const out = {}
  for (const k of SHEET_KINDS) out[k] = make(SHEET.w, SHEET.h, sheetDrawers[k])
  return out
}
export const SHEET_ASPECT = SHEET.w / SHEET.h

/* ------------------------------------------------------------------- glow */
export function createGlowTexture(color = '244,169,0') {
  return make(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, `rgba(${color},0.55)`)
    g.addColorStop(0.35, `rgba(${color},0.16)`)
    g.addColorStop(1, `rgba(${color},0)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}
