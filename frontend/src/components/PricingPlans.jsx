import { Link } from 'react-router'
import { Check } from 'lucide-react'
import { PLANS } from '@younifyai/shared'

/** The three plans from the deck. `current` highlights the signed-in plan; `onChoose` replaces links. */
export default function PricingPlans({ current, onChoose, busy }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {PLANS.map((p) => {
        const featured = p.id === 'premium'
        const isCurrent = current === p.id
        return (
          <div
            key={p.id}
            className={`relative flex flex-col rounded-3xl border p-7 md:p-8 ${featured ? 'border-ink bg-ink text-paper' : 'border-fog bg-card text-ink'}`}
          >
            <div className="flex items-center justify-between">
              <span className={`mono text-[0.7rem] font-semibold uppercase tracking-[0.12em] ${featured ? 'text-amber' : 'text-slate'}`}>{p.name}</span>
              {featured && <span className="chip bg-amber text-ink">Most students</span>}
              {isCurrent && !featured && <span className="chip bg-paper-2 text-slate">Current plan</span>}
            </div>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="font-display text-[3.2rem] font-bold leading-none tracking-[-0.04em]">₹{p.price.toLocaleString('en-IN')}</span>
              <span className={featured ? 'text-paper/60' : 'text-slate'}>{p.period ? `/ ${p.period}` : 'forever'}</span>
            </p>
            <p className={`mt-3 text-[0.95rem] ${featured ? 'text-paper/75' : 'text-slate'}`}>{p.blurb}</p>
            <ul className="mt-7 flex-1 space-y-3 text-[0.95rem]">
              {p.features.map((f) => (
                <li key={f} className="flex gap-3">
                  <Check size={18} className={`mt-0.5 shrink-0 ${featured ? 'text-amber' : 'text-ok'}`} aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              {onChoose ? (
                <button
                  type="button"
                  disabled={isCurrent || busy}
                  onClick={() => onChoose(p.id)}
                  className={`btn w-full ${featured ? 'btn-amber' : 'btn-ink'}`}
                >
                  {isCurrent ? 'Current plan' : `Switch to ${p.name}`}
                </button>
              ) : (
                <Link to={`/signup?plan=${p.id}`} className={`btn w-full ${featured ? 'btn-amber' : 'btn-ink'}`}>
                  {p.price === 0 ? 'Start free' : `Choose ${p.name}`}
                </Link>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
