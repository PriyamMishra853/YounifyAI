import { useRef, useState } from 'react'
import { Check, TriangleAlert, FileText, Download } from 'lucide-react'
import { PIPELINE_STAGES } from '@younifyai/shared'
import { gsap, useGSAP, useReducedMotion } from '../../lib/motion'
import { ModalityChip } from '../../components/Brand'

const DARK = { '--p-bg': '#07182A', '--p-fg': '#EEF2F6', '--p-muted': '#8FA3B8', '--p-card': '#0D2B45', '--p-line': 'rgba(255,255,255,0.10)', '--p-sub': 'rgba(255,255,255,0.05)' }
const PAPER = { '--p-bg': '#EEF2F6', '--p-fg': '#16202A', '--p-muted': '#56667A', '--p-card': '#FFFFFF', '--p-line': '#D9E1EA', '--p-sub': '#F3F6F9' }

const card = 'rounded-2xl border border-[var(--p-line)] bg-[var(--p-card)] p-4 md:p-5'
const tiny = 'mono text-[0.625rem] uppercase tracking-[0.08em] text-[var(--p-muted)]'

/* ------------------------------------------------------------ specimens */

function Wave() {
  const bars = Array.from({ length: 38 }, (_, i) => 8 + Math.abs(Math.sin(i * 1.7) * 26 + Math.cos(i * 0.6) * 14) * Math.sin((i / 37) * Math.PI))
  return (
    <svg viewBox="0 0 380 70" className="h-16 w-full" aria-hidden="true">
      {bars.map((h, i) => <rect key={i} x={i * 10} y={35 - h / 2} width="5" height={h} rx="2.5" fill="#7056C8" />)}
    </svg>
  )
}

const SPECIMENS = {
  capture: () => (
    <div className={card}>
      <Wave />
      <div className="mt-3 flex items-center justify-between text-[0.9rem]">
        <span className="font-medium">voice_note_0412.m4a</span>
        <span className="mono text-[0.75rem] text-[var(--p-muted)]">0:18</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ModalityChip kind="voice" />
        <span className="text-[0.8rem] text-[var(--p-muted)]">Hindi + English, recorded at the counter</span>
      </div>
    </div>
  ),
  extract: () => (
    <div className={card}>
      <p className={tiny}>Transcript · speech to text</p>
      <p className="mono mt-3 text-[0.8rem] leading-relaxed">
        “do kilo basmati chawal, ek litre sarson ka tel, aur paanch biscuit packet… total bata do”
      </p>
      <div className="mt-4 flex gap-4 border-t border-[var(--p-line)] pt-3 text-[0.75rem] text-[var(--p-muted)]">
        <span>language <b className="font-semibold text-[var(--p-fg)]">hi-en</b></span>
        <span>confidence <b className="font-semibold text-[var(--p-fg)]">0.94</b></span>
      </div>
    </div>
  ),
  normalize: () => (
    <div className={card}>
      <p className={tiny}>Segments</p>
      <ul className="mt-3 space-y-2.5 text-[0.82rem]">
        {[['do kilo basmati chawal', 'Basmati rice', '2 kg'], ['ek litre sarson ka tel', 'Mustard oil', '1 L'], ['paanch biscuit packet', 'Biscuits', '5 pc']].map(([a, b, q]) => (
          <li key={a} className="grid grid-cols-[1fr_auto] gap-x-3">
            <span className="mono text-[0.7rem] text-[var(--p-muted)]">{a}</span>
            <span />
            <span className="font-semibold">{b}</span>
            <span className="mono text-[0.75rem]">{q}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-[var(--p-line)] pt-3 text-[0.75rem] text-[var(--p-muted)]">intent <b className="text-[var(--p-fg)]">bill</b> · 3 line items</p>
    </div>
  ),
  retrieve: () => (
    <div className={card}>
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-amber" aria-hidden="true" />
        <span className="text-[0.9rem] font-semibold">Store price list</span>
        <span className="ml-auto mono text-[0.7rem] text-[var(--p-muted)]">42 items</span>
      </div>
      <ul className="mt-4 space-y-3 text-[0.82rem]">
        {[['Basmati rice', '₹120 / kg', 0.92], ['Mustard oil', '₹180 / L', 0.88], ['Biscuits', '₹10 / pc', 0.81]].map(([n, p, s]) => (
          <li key={n}>
            <div className="flex justify-between"><span>{n}</span><span className="mono text-[0.75rem]">{p}</span></div>
            <div className="mt-1.5 h-1 rounded-full bg-[var(--p-sub)]"><div className="h-1 rounded-full bg-amber" style={{ width: `${s * 100}%` }} /></div>
          </li>
        ))}
      </ul>
    </div>
  ),
  generate: () => (
    <div className={`${card} mono overflow-hidden text-[0.7rem] leading-[1.7]`}>
      <pre className="whitespace-pre-wrap">
        <span className="text-[var(--p-muted)]">{'{'}</span>{'\n'}
        {'  '}<span className="text-amber">"items"</span>: [{'\n'}
        {[['Basmati rice', 2, 'kg', 120, 240], ['Mustard oil', 1, 'L', 180, 180], ['Biscuits', 5, 'pc', 10, 50]].map(([n, q, u, r, a]) => (
          <span key={n}>{'    { '}<span className="text-amber">"item"</span>: "{n}", <span className="text-amber">"qty"</span>: <span className="text-m-text">{q}</span>, <span className="text-amber">"unit"</span>: "{u}", <span className="text-amber">"rate"</span>: <span className="text-m-text">{r}</span>, <span className="text-amber">"amount"</span>: <span className="text-m-text">{a}</span>{' },\n'}</span>
        ))}
        {'  ],\n  '}<span className="text-amber">"total"</span>: <span className="text-m-text">470</span>{'\n'}
        <span className="text-[var(--p-muted)]">{'}'}</span>
      </pre>
    </div>
  ),
  validate: () => (
    <div className={card}>
      <ul className="space-y-3 text-[0.85rem]">
        {['Every item priced from your list', 'Each amount equals quantity × rate', 'Total is ₹470'].map((t) => (
          <li key={t} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />{t}</li>
        ))}
        <li className="flex gap-2.5 rounded-lg bg-amber/15 p-2.5"><TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />“Biscuit packet” matched a generic item. Confirm the brand.</li>
      </ul>
    </div>
  ),
  deliver: () => (
    <div className={card}>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-lg font-bold">Bill #0412</span>
        <span className="rounded-full bg-ok/15 px-2 py-0.5 mono text-[0.625rem] uppercase text-ok">Approved</span>
      </div>
      <table className="mt-3 w-full text-[0.8rem]">
        <tbody>
          {[['Basmati rice', '2 kg', '240'], ['Mustard oil', '1 L', '180'], ['Biscuits', '5 pc', '50']].map(([n, q, a]) => (
            <tr key={n} className="border-b border-[var(--p-line)]"><td className="py-1.5">{n}</td><td className="mono text-[0.7rem] text-[var(--p-muted)]">{q}</td><td className="mono py-1.5 text-right">₹{a}</td></tr>
          ))}
          <tr><td className="pt-2 font-semibold" colSpan={2}>Total</td><td className="mono pt-2 text-right font-semibold">₹470</td></tr>
        </tbody>
      </table>
      <div className="mt-4 flex gap-2">
        <span className="btn btn-sm btn-ink pointer-events-none h-8 text-[0.8rem]"><Download size={14} aria-hidden="true" />PDF</span>
        <span className="btn btn-sm pointer-events-none h-8 border border-[var(--p-line)] text-[0.8rem]">DOCX</span>
        <span className="ml-auto self-center text-[0.7rem] text-[var(--p-muted)]">approved 10:42</span>
      </div>
    </div>
  ),
}

const NOTES = {
  capture: 'The shopkeeper records the order at the counter. Any input works the same way: a lecture video, a whiteboard photo, a chat export.',
  extract: 'Speech becomes text. Images go through OCR and vision; videos are split into audio and key frames.',
  normalize: 'The transcript is cleaned, split into items and tagged, so the model sees tidy input instead of noise.',
  retrieve: 'Your own reference material is searched, here the store’s price list, so the document follows your rules.',
  generate: 'A language model fills the template’s schema. The result is structured data, not a paragraph to copy from.',
  validate: 'Rules check the arithmetic and required fields. Anything uncertain is flagged for a person.',
  deliver: 'You review, approve and export. Every edit and approval is written to the audit trail.',
}

/* ----------------------------------------------------------------- section */

export default function Pipeline({ onTheme }) {
  const root = useRef(null)
  const track = useRef(null)
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)
  const reduced = useReducedMotion()

  useGSAP(() => {
    const mm = gsap.matchMedia()
    mm.add('(min-width: 768px)', () => {
      const distance = () => Math.max(0, track.current.scrollWidth - window.innerWidth)
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: () => `+=${distance() + window.innerHeight * 0.6}`,
          pin: '.pipe-pin',
          scrub: reduced ? true : 0.8,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const idx = Math.min(6, Math.floor(self.progress * 7.2))
            if (idx !== activeRef.current) { activeRef.current = idx; setActive(idx) }
            onTheme?.(self.progress > 0.55 ? 'paper' : 'dark')
          },
          onLeave: () => onTheme?.('paper'),
          onLeaveBack: () => onTheme?.('dark'),
        },
      })
      tl.to(track.current, { x: () => -distance(), duration: 1 })
        .fromTo(root.current, DARK, { ...PAPER, duration: 0.3 }, 0.48)
    })
    mm.add('(max-width: 767px)', () => {
      gsap.utils.toArray('.pipe-panel').forEach((p) => {
        gsap.from(p, { opacity: 0, y: 30, duration: 0.8, ease: 'expo.out', scrollTrigger: { trigger: p, start: 'top 85%' } })
      })
    })
    return () => mm.revert()
  }, { scope: root, dependencies: [reduced] })

  return (
    <section id="pipeline" ref={root} style={DARK} className="relative bg-[var(--p-bg)] text-[var(--p-fg)]" aria-labelledby="pipeline-title">
      <div className="pipe-pin flex flex-col md:h-svh md:overflow-hidden">
        <header className="mx-auto w-full max-w-[1400px] px-5 pt-24 md:px-10 md:pt-28">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="eyebrow text-amber">How it works · seven steps</p>
              <h2 id="pipeline-title" className="display mt-4 text-[clamp(2.2rem,4.4vw,4.2rem)]">From raw signal to<br className="hidden md:block" /> a reliable document</h2>
            </div>
            <p className="max-w-sm text-[1rem] leading-relaxed text-[var(--p-muted)]">
              Follow one voice note from a shop counter through every step. Lectures, meetings and diaries take the same path.
            </p>
          </div>
        </header>

        <div className="flex-1 md:flex md:items-center">
          <ol ref={track} className="mt-10 flex flex-col gap-10 px-5 pb-16 md:mt-0 md:flex-row md:gap-5 md:pb-0 md:pl-[max(2.5rem,calc((100vw-1400px)/2+2.5rem))] md:pr-[12vw]">
            {PIPELINE_STAGES.map((s, i) => {
              const Spec = SPECIMENS[s.key]
              return (
                <li key={s.key} className="pipe-panel flex shrink-0 flex-col md:w-[clamp(19rem,29vw,26rem)]">
                  <div className="flex items-baseline gap-3">
                    <span className="mono text-[0.75rem] font-semibold text-amber">{String(i + 1).padStart(2, '0')}</span>
                    <h3 className="font-display text-[1.7rem] font-bold tracking-[-0.02em]">{s.label}</h3>
                  </div>
                  <p className="mono mt-1 text-[0.7rem] text-[var(--p-muted)]">{s.detail}</p>
                  <div className="mt-4"><Spec /></div>
                  <p className="mt-4 text-[0.92rem] leading-relaxed text-[var(--p-muted)]">{NOTES[s.key]}</p>
                </li>
              )
            })}
          </ol>
        </div>

        <nav aria-label="Pipeline progress" className="mx-auto hidden w-full max-w-[1400px] px-10 pb-8 md:block">
          <ol className="grid grid-cols-7 gap-2">
            {PIPELINE_STAGES.map((s, i) => (
              <li key={s.key}>
                <div className="h-[3px] overflow-hidden rounded-full bg-[var(--p-line)]">
                  <div className="h-full rounded-full bg-amber transition-transform duration-500" style={{ transform: `scaleX(${i <= active ? 1 : 0})`, transformOrigin: 'left' }} />
                </div>
                <span className={`mono mt-2 block text-[0.65rem] uppercase tracking-[0.08em] transition-colors ${i === active ? 'text-[var(--p-fg)]' : 'text-[var(--p-muted)]'}`}>{s.label}</span>
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </section>
  )
}
