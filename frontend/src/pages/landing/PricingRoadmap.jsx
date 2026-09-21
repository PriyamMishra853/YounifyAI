import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import PricingPlans from '../../components/PricingPlans'

const PHASES = [
  { when: 'Now', name: 'Ideathon MVP', items: ['Education: video and screenshots → notes', 'Business: voice and messages → reports'] },
  { when: 'Next', name: 'Public beta', items: ['Templates, history, exports, personal diary', 'Quality feedback and usage analytics'] },
  { when: 'Later', name: 'B2B expansion', items: ['Team workspaces, integrations, approvals', 'Retail, clinics, field operations'] },
  { when: 'Vision', name: 'Documentation OS', items: ['API, template marketplace, vertical copilots', 'The layer between capture and work'] },
]

const METRICS = [
  ['Aha', 'Time to first useful document'],
  ['Quality', 'Share of documents approved with few edits'],
  ['Retention', 'Weekly documenting users'],
  ['Economics', 'AI cost per document'],
  ['Expansion', 'Free → paid → team'],
]

export function PricingSection() {
  return (
    <section id="pricing" data-nav-theme="paper" className="border-t border-fog bg-paper px-5 py-28 text-ink md:px-10 md:py-36" aria-labelledby="pricing-title">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="eyebrow text-amber-ink">Pricing</p>
            <h2 id="pricing-title" className="display mt-4 text-[clamp(2.2rem,4.4vw,4.2rem)]">Free for students.<br />Built to grow with teams.</h2>
          </div>
          <Link to="/pricing" className="inline-flex items-center gap-2 text-[0.95rem] font-semibold underline-offset-4 hover:underline">
            Compare plans in detail <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-12"><PricingPlans /></div>
        <p className="mt-6 text-[0.85rem] text-slate">*Pro is unlimited within a fair-use policy of 500 documents a day. Indicative pricing for the Ideathon MVP.</p>
      </div>
    </section>
  )
}

export function RoadmapSection() {
  return (
    <section id="roadmap" data-nav-theme="paper" className="border-t border-fog bg-paper px-5 py-28 text-ink md:px-10 md:py-36" aria-labelledby="roadmap-title">
      <div className="mx-auto max-w-[1400px]">
        <p className="eyebrow text-amber-ink">Roadmap</p>
        <h2 id="roadmap-title" className="display mt-4 max-w-4xl text-[clamp(2.2rem,4.4vw,4.2rem)]">Win one workflow. Then become the documentation layer.</h2>
        <ol className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-fog bg-fog md:grid-cols-4">
          {PHASES.map((p, i) => (
            <li key={p.when} className={`p-6 md:p-7 ${i === 0 ? 'bg-ink text-paper' : 'bg-card'}`}>
              <span className={`mono text-[0.7rem] font-semibold uppercase tracking-[0.12em] ${i === 0 ? 'text-amber' : 'text-slate'}`}>{p.when}</span>
              <p className="mt-3 font-display text-2xl font-bold tracking-tight">{p.name}</p>
              <ul className={`mt-4 space-y-2 text-[0.92rem] ${i === 0 ? 'text-paper/75' : 'text-slate'}`}>
                {p.items.map((it) => <li key={it}>{it}</li>)}
              </ul>
            </li>
          ))}
        </ol>
        <div className="mt-14 grid gap-8 md:grid-cols-[16rem_1fr]">
          <h3 className="font-display text-xl font-semibold tracking-tight">What we will measure</h3>
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
            {METRICS.map(([k, v]) => (
              <div key={k}>
                <dt className="mono text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-amber-ink">{k}</dt>
                <dd className="mt-1.5 text-[0.95rem]">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}

export function FinalCta() {
  return (
    <section data-nav-theme="dark" className="relative overflow-hidden bg-abyss px-5 py-32 md:px-10 md:py-44" aria-labelledby="cta-title">
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 top-1/2 h-[42rem] w-[42rem] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(244,169,0,0.22),rgba(244,169,0)_65%)]" />
      <div className="relative mx-auto max-w-[1400px]">
        <h2 id="cta-title" className="display max-w-5xl text-[clamp(2.6rem,6.2vw,6rem)] text-paper">
          Your next lecture is <span className="text-amber">already a document.</span>
        </h2>
        <p className="mt-6 max-w-xl text-lg text-paper/70">Five free documents a day. No card needed. Upload a recording, a photo or a chat and see what comes back.</p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/signup" className="btn btn-amber h-12 px-6 text-base" data-cursor="Start">
            Start capturing, free <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link to="/login" className="btn btn-ghost-dark h-12 px-6 text-base">I have an account</Link>
        </div>
      </div>
    </section>
  )
}
