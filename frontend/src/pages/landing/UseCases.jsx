import { useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { SYSTEM_TEMPLATES } from '@younifyai/shared'
import { gsap, useGSAP, useReducedMotion } from '../../lib/motion'
import { ModalityChip } from '../../components/Brand'
import DocPreview from '../../components/DocPreview'
import { showcaseDocuments } from '../../lib/api/samples'
import { bytes } from '../../lib/format'

const BENEFITS = {
  lecture_notes: ['Hours of rewriting saved', 'Revision questions included'],
  meeting_report: ['No retyping into sheets', 'Owners and due dates tracked'],
  journey_diary: ['Moments kept in order', 'Searchable later'],
  voice_bill: ['Priced from your list', 'Fewer keystrokes at the counter'],
}

export default function UseCases() {
  const root = useRef(null)
  const [tab, setTab] = useState(SYSTEM_TEMPLATES[0].id)
  const reduced = useReducedMotion()
  const showcase = showcaseDocuments()
  const template = SYSTEM_TEMPLATES.find((t) => t.id === tab)
  const sample = showcase[tab]

  useGSAP(() => {
    if (reduced) return
    gsap.from('.uc-head > *', { opacity: 0, y: 30, stagger: 0.08, duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: root.current, start: 'top 75%' } })
  }, { scope: root, dependencies: [reduced] })

  useGSAP(() => {
    if (reduced) return
    gsap.fromTo('.uc-panel', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out', stagger: 0.06 })
  }, { scope: root, dependencies: [tab, reduced] })

  const onKey = (e) => {
    const i = SYSTEM_TEMPLATES.findIndex((t) => t.id === tab)
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = SYSTEM_TEMPLATES[(i + (e.key === 'ArrowRight' ? 1 : -1) + SYSTEM_TEMPLATES.length) % SYSTEM_TEMPLATES.length]
      setTab(next.id)
      document.getElementById(`uc-tab-${next.id}`)?.focus()
    }
  }

  return (
    <section id="use-cases" ref={root} data-nav-theme="paper" className="bg-paper px-5 py-28 text-ink md:px-10 md:py-36" aria-labelledby="uc-title">
      <div className="mx-auto max-w-[1400px]">
        <div className="uc-head grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="eyebrow text-amber-ink">Use cases</p>
            <h2 id="uc-title" className="display mt-4 text-[clamp(2.2rem,4.4vw,4.2rem)]">One engine.<br />Four kinds of paperwork.</h2>
          </div>
          <p className="max-w-sm text-[1rem] leading-relaxed text-slate">
            Same core, different template, different reference material. We start where the pain is obvious, then expand.
          </p>
        </div>

        <div role="tablist" aria-label="Use cases" className="no-scrollbar mt-12 flex gap-2 overflow-x-auto border-b border-fog" onKeyDown={onKey}>
          {SYSTEM_TEMPLATES.map((t) => {
            const on = t.id === tab
            return (
              <button
                key={t.id}
                id={`uc-tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={on}
                aria-controls="uc-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={`relative -mb-px shrink-0 border-b-2 px-4 pb-4 pt-2 text-left transition-colors ${on ? 'border-ink text-ink' : 'border-transparent text-slate hover:text-ink'}`}
              >
                <span className="mono block text-[0.6rem] uppercase tracking-[0.1em]">{t.stage === 'mvp' ? 'MVP focus' : 'Expansion'} · {t.vertical}</span>
                <span className="mt-1 block font-display text-lg font-semibold tracking-tight">{t.flow}</span>
              </button>
            )
          })}
        </div>

        <div id="uc-panel" role="tabpanel" aria-labelledby={`uc-tab-${tab}`} className="mt-10 grid gap-6 lg:grid-cols-[0.8fr_auto_1.2fr] lg:items-start">
          <div className="uc-panel">
            <p className="eyebrow text-slate">What goes in</p>
            <ul className="mt-4 space-y-2">
              {sample.inputs.map((inp) => (
                <li key={inp.name} className="card flex items-center gap-3 px-4 py-3">
                  <ModalityChip kind={inp.kind} tone="paper" />
                  <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium">{inp.name}</span>
                  <span className="mono text-[0.7rem] text-slate">{bytes(inp.size)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[1rem] leading-relaxed text-slate">{template.description}</p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {BENEFITS[tab].map((b) => (
                <li key={b} className="chip bg-ink text-paper">{b}</li>
              ))}
            </ul>
          </div>
          <div className="uc-panel hidden h-full items-center lg:flex" aria-hidden="true">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-amber text-ink"><ArrowRight size={20} /></span>
          </div>
          <div className="uc-panel card relative p-6 shadow-[0_30px_60px_-30px_rgba(22,32,42,0.35)] md:p-8">
            <span className="absolute right-6 top-6 mono rounded-full bg-paper-2 px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.08em] text-slate">What comes out</span>
            <DocPreview template={template} content={sample.content} />
          </div>
        </div>
      </div>
    </section>
  )
}
