import { useEffect, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router'
import { ArrowRight, CheckCircle2, FileText, Plus, TriangleAlert, X } from 'lucide-react'
import { SYSTEM_TEMPLATES } from '@younifyai/shared'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { timeAgo } from '../../lib/format'
import { ModalityChip } from '../../components/Brand'
import { EmptyState, PageHeader, StatusBadge, UsageMeter } from '../../components/ui'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { user, can } = useAuth()
  const { refreshUsage } = useOutletContext()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    document.title = 'Today · YounifyAI'
    api.getOverview().then(setData).catch(setError)
    refreshUsage()
  }, [refreshUsage])

  const welcome = params.get('welcome') === '1'

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting()}, ${user?.name?.split(' ')[0]}`}
        actions={can('edit') && <Link to="/app/capture" className="btn btn-ink"><Plus size={18} aria-hidden="true" />New capture</Link>}
      />

      {welcome && (
        <div className="animate-rise relative flex gap-4 rounded-2xl bg-ink p-5 text-paper md:p-6">
          <CheckCircle2 className="mt-0.5 shrink-0 text-amber" size={22} aria-hidden="true" />
          <div className="pr-8">
            <p className="font-semibold">Your workspace is ready.</p>
            <p className="mt-1 text-[0.95rem] text-paper/75">
              We added three sample documents so you can try the editor, and a sample price list under Knowledge.
              When you are ready, capture something of your own.
            </p>
          </div>
          <button type="button" onClick={() => setParams({})} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-paper/70 hover:bg-white/10" aria-label="Dismiss">
            <X size={18} />
          </button>
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-bad">{error.message}</p>}

      <section aria-labelledby="stats-title" className="grid gap-4 md:grid-cols-3">
        <h2 id="stats-title" className="sr-only">Today at a glance</h2>
        <div className="card p-5">
          <p className="eyebrow text-slate">Documents today</p>
          <div className="mt-4"><UsageMeter usage={data?.usage} /></div>
        </div>
        <Link to="/app/documents?status=draft" className="card group p-5 transition-colors hover:border-mist">
          <p className="eyebrow text-slate">Awaiting your review</p>
          <p className="mt-3 flex items-baseline gap-2 font-display text-4xl font-bold tracking-tight">
            {data ? data.counts.awaitingReview : '–'}
            <ArrowRight size={18} className="text-slate transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </p>
        </Link>
        <Link to="/app/documents?status=approved" className="card group p-5 transition-colors hover:border-mist">
          <p className="eyebrow text-slate">Approved</p>
          <p className="mt-3 flex items-baseline gap-2 font-display text-4xl font-bold tracking-tight">
            {data ? data.counts.approved : '–'}
            <ArrowRight size={18} className="text-slate transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </p>
        </Link>
      </section>

      {!!data?.running?.length && (
        <section aria-labelledby="running-title">
          <h2 id="running-title" className="font-display text-xl font-semibold tracking-tight">Processing now</h2>
          <ul className="mt-4 space-y-2">
            {data.running.map((j) => (
              <li key={j.id}>
                <Link to={`/app/jobs/${j.id}`} className="card flex items-center gap-4 px-5 py-4 hover:border-mist">
                  <span className="h-2 w-2 animate-pulse-dot rounded-full bg-m-text" />
                  <span className="flex-1 font-medium">{j.templateName}</span>
                  <span className="text-[0.85rem] text-slate">{j.stages.find((s) => s.status === 'running')?.key || 'queued'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {can('edit') && (
        <section aria-labelledby="quick-title">
          <h2 id="quick-title" className="font-display text-xl font-semibold tracking-tight">Start from a template</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {SYSTEM_TEMPLATES.map((t) => (
              <li key={t.id}>
                <Link to={`/app/capture?template=${t.id}`} className="card group flex h-full flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-mist hover:shadow-[0_20px_40px_-28px_rgba(22,32,42,0.4)]">
                  <span className="mono text-[0.62rem] uppercase tracking-[0.1em] text-slate">{t.vertical}</span>
                  <span className="mt-2 font-display text-lg font-bold tracking-tight">{t.name}</span>
                  <span className="mt-1 text-[0.88rem] text-slate">{t.flow}</span>
                  <span className="mt-4 flex flex-wrap gap-1">
                    {t.accepts.slice(0, 3).map((k) => <ModalityChip key={k} kind={k} tone="paper" />)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="recent-title">
        <div className="flex items-end justify-between">
          <h2 id="recent-title" className="font-display text-xl font-semibold tracking-tight">Recent documents</h2>
          <Link to="/app/documents" className="text-[0.9rem] font-semibold hover:underline">View all</Link>
        </div>
        <div className="mt-4">
          {!data ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div>
          ) : data.recent.length === 0 ? (
            <EmptyState icon={FileText} title="No documents yet" body="Capture a lecture, a voice note or a chat, and your first draft will show up here." action={<Link to="/app/capture" className="btn btn-ink">New capture</Link>} />
          ) : (
            <ul className="card divide-y divide-fog overflow-hidden">
              {data.recent.map((d) => {
                const errors = d.issues.filter((i) => i.level === 'error').length
                const warnings = d.issues.length - errors
                return (
                  <li key={d.id}>
                    <Link to={`/app/documents/${d.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper/60">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{d.title}</p>
                        <p className="mt-0.5 text-[0.82rem] text-slate">{d.templateName} · {timeAgo(d.updatedAt)}{d.sample ? ' · sample' : ''}</p>
                      </div>
                      {(errors > 0 || warnings > 0) && d.status !== 'approved' && (
                        <span className={`hidden items-center gap-1 text-[0.8rem] sm:flex ${errors ? 'text-bad' : 'text-warn'}`}>
                          <TriangleAlert size={14} aria-hidden="true" />{errors || warnings} to check
                        </span>
                      )}
                      <StatusBadge status={d.status} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
