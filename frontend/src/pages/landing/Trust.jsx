import { useRef } from 'react'
import { gsap, useGSAP, useReducedMotion } from '../../lib/motion'

const PRINCIPLES = [
  { k: 'RLS', title: 'Row-level access', body: 'Every row belongs to a workspace. The database itself refuses reads and writes across workspaces.' },
  { k: 'RBAC', title: 'Roles', body: 'Owners manage plan and people. Editors capture, edit and approve. Viewers read and export.' },
  { k: 'LOG', title: 'Audit trail', body: 'Generation, every edit, approval and export is recorded with who did it and when.' },
  { k: 'REVIEW', title: 'Human approval', body: 'Nothing is final until a person approves it. Editing an approved document withdraws the approval.' },
]

const LOG = [
  ['10:41:07', 'YounifyAI', 'generated', 'Voice Bill #0412 from 1 voice note'],
  ['10:41:08', 'YounifyAI', 'flagged', '“biscuit packet” matched a generic item'],
  ['10:42:15', 'Meera · editor', 'edited', 'Biscuits → Glucose biscuits, v2'],
  ['10:42:31', 'Meera · editor', 'approved', 'v2'],
  ['10:42:40', 'Meera · editor', 'exported', 'PDF'],
]

const STACK = [
  ['Client', 'React web app, responsive, works on a phone at the counter'],
  ['API', 'Node.js + Express: auth, roles, validation, quotas'],
  ['AI orchestration', 'Pipeline runner: extract, normalize, retrieve, generate, validate'],
  ['AI services', 'Whisper, OCR, vision and a language model behind one interface'],
  ['Data', 'PostgreSQL (Supabase) with row-level security, file storage, vector search'],
]

export default function Trust() {
  const root = useRef(null)
  const reduced = useReducedMotion()

  useGSAP(() => {
    if (reduced) return
    gsap.from('.log-row', { opacity: 0, x: -16, stagger: 0.12, duration: 0.6, ease: 'expo.out', scrollTrigger: { trigger: '.log', start: 'top 75%' } })
    gsap.from('.stack-row', { opacity: 0, y: 20, stagger: 0.08, duration: 0.7, ease: 'expo.out', scrollTrigger: { trigger: '.stack', start: 'top 80%' } })
  }, { scope: root, dependencies: [reduced] })

  return (
    <section id="trust" ref={root} data-nav-theme="paper" className="border-t border-fog bg-paper px-5 py-28 text-ink md:px-10 md:py-36" aria-labelledby="trust-title">
      <div className="mx-auto max-w-[1400px]">
        <p className="eyebrow text-amber-ink">Trust by design</p>
        <h2 id="trust-title" className="display mt-4 max-w-3xl text-[clamp(2.2rem,4.4vw,4.2rem)]">Designed for review, not blind automation.</h2>

        <div className="mt-14 grid gap-12 lg:grid-cols-2">
          <dl className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.k}>
                <dt>
                  <span className="mono rounded-md bg-ink px-2 py-1 text-[0.65rem] font-semibold tracking-[0.08em] text-amber">{p.k}</span>
                  <span className="mt-3 block font-display text-xl font-semibold tracking-tight">{p.title}</span>
                </dt>
                <dd className="mt-2 text-[0.95rem] leading-relaxed text-slate">{p.body}</dd>
              </div>
            ))}
          </dl>

          <figure className="log card overflow-hidden">
            <figcaption className="flex items-center justify-between border-b border-fog px-5 py-3">
              <span className="eyebrow text-slate">Audit trail · Bill #0412</span>
              <span className="mono text-[0.65rem] text-slate">5 events</span>
            </figcaption>
            <ol className="divide-y divide-fog">
              {LOG.map(([time, who, action, detail]) => (
                <li key={time} className="log-row grid grid-cols-[4.5rem_1fr] gap-3 px-5 py-3.5 text-[0.88rem] sm:grid-cols-[4.5rem_8.5rem_1fr]">
                  <span className="mono text-[0.7rem] text-slate">{time}</span>
                  <span className="font-medium max-sm:hidden">{who}</span>
                  <span>
                    <span className={`mono mr-2 rounded px-1.5 py-0.5 text-[0.62rem] uppercase ${action === 'approved' ? 'bg-ok/15 text-ok' : action === 'flagged' ? 'bg-amber/20 text-amber-ink' : 'bg-paper-2 text-slate'}`}>{action}</span>
                    {detail}
                  </span>
                </li>
              ))}
            </ol>
          </figure>
        </div>

        <div className="stack mt-24">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <h3 className="font-display text-[clamp(1.6rem,2.6vw,2.3rem)] font-bold tracking-[-0.02em]">Architecture</h3>
            <p className="max-w-md text-[0.95rem] text-slate">Cloud-native and API-first. No model training in the MVP: foundation models, your reference material and structured generation.</p>
          </div>
          <ol className="mt-8 overflow-hidden rounded-2xl border border-fog">
            {STACK.map(([layer, what], i) => (
              <li key={layer} className="stack-row grid gap-1 border-b border-fog bg-card px-5 py-4 last:border-b-0 md:grid-cols-[14rem_1fr] md:items-center md:px-6" style={{ background: `color-mix(in srgb, #0D2B45 ${i * 2}%, white)` }}>
                <span className="mono text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink">{layer}</span>
                <span className="text-[0.95rem] text-slate">{what}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
