import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowRight, Check, Circle, X } from 'lucide-react'
import { PIPELINE_STAGES } from '@younifyai/shared'
import { api } from '../../lib/api'
import { ModalityChip } from '../../components/Brand'
import { PageHeader, Spinner, StatusBadge } from '../../components/ui'

function duration(a, b) {
  if (!a || !b) return ''
  const ms = new Date(b) - new Date(a)
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

function StageIcon({ status }) {
  if (status === 'done') return <span className="grid h-7 w-7 place-items-center rounded-full bg-ok text-white"><Check size={15} strokeWidth={3} aria-hidden="true" /></span>
  if (status === 'running') return <span className="grid h-7 w-7 place-items-center rounded-full bg-m-text/12 text-m-text"><Spinner size={15} /></span>
  if (status === 'failed') return <span className="grid h-7 w-7 place-items-center rounded-full bg-bad text-white"><X size={15} strokeWidth={3} aria-hidden="true" /></span>
  if (status === 'skipped') return <span className="grid h-7 w-7 place-items-center rounded-full bg-paper-2 text-slate"><Circle size={10} aria-hidden="true" /></span>
  return <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-fog bg-card" />
}

export default function Job() {
  const { id } = useParams()
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const ready = useRef(null)

  useEffect(() => {
    document.title = 'Processing · YounifyAI'
    return api.subscribeJob(id, setJob, setError)
  }, [id])

  useEffect(() => {
    if (job?.status === 'succeeded') {
      document.title = 'Draft ready · YounifyAI'
      ready.current?.focus()
    }
  }, [job?.status])

  if (error) {
    return (
      <div className="card p-8">
        <p className="font-semibold text-bad">{error.message}</p>
        <Link to="/app" className="btn btn-line btn-sm mt-4">Back to Today</Link>
      </div>
    )
  }
  if (!job) return <div className="space-y-3"><div className="skeleton h-10 w-72" /><div className="skeleton h-96" /></div>

  const stages = PIPELINE_STAGES.map((s) => ({ ...s, ...(job.stages.find((x) => x.key === s.key) || { status: 'pending', log: [] }) }))
  const done = stages.filter((s) => s.status === 'done' || s.status === 'skipped').length

  return (
    <div>
      <PageHeader
        eyebrow={`Job · ${job.templateName}`}
        title={job.status === 'succeeded' ? 'Your draft is ready' : job.status === 'failed' ? 'This capture failed' : 'Building your document'}
        actions={<StatusBadge status={job.status} />}
      />
      <div className="mt-4 flex flex-wrap gap-1.5">
        {job.inputs.map((i) => (i.url ? (
          <a key={i.id} href={i.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
            <ModalityChip kind={i.kind} tone="paper">{i.name}</ModalityChip>
          </a>
        ) : (
          <ModalityChip key={i.id} kind={i.kind} tone="paper">{i.name}</ModalityChip>
        )))}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <ol className="card divide-y divide-fog" aria-live="polite" aria-label="Pipeline stages">
          {stages.map((s, i) => (
            <li key={s.key} className={`flex gap-4 px-5 py-4 transition-opacity ${s.status === 'pending' ? 'opacity-55' : ''}`}>
              <StageIcon status={s.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold">
                    <span className="mono mr-2 text-[0.7rem] text-slate">{String(i + 1).padStart(2, '0')}</span>
                    {s.label}
                  </p>
                  <span className="mono text-[0.7rem] text-slate">{s.status === 'done' ? duration(s.startedAt, s.finishedAt) : s.status === 'running' ? 'running' : s.status === 'skipped' ? 'skipped' : ''}</span>
                </div>
                <p className="text-[0.85rem] text-slate">{s.detail}</p>
                {!!s.log?.length && (
                  <ul className="mono mt-2 space-y-0.5 text-[0.7rem] leading-relaxed text-ink/80">
                    {s.log.map((l, k) => <li key={k} className="animate-rise">› {l}</li>)}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="card p-5">
            <p className="eyebrow text-slate">Progress</p>
            <p className="mt-3 font-display text-4xl font-bold tracking-tight">{done}<span className="text-slate">/7</span></p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-2">
              <div className="h-full rounded-full bg-amber transition-[width] duration-500" style={{ width: `${(done / 7) * 100}%` }} />
            </div>
            {job.status === 'succeeded' && job.documentId && (
              <Link ref={ready} to={`/app/documents/${job.documentId}`} className="btn btn-ink mt-6 w-full">
                Review the document <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )}
            {job.status === 'failed' && (
              <>
                <p className="mt-4 text-[0.9rem] text-bad">{job.error || 'Something went wrong while processing.'}</p>
                <Link to={`/app/capture?template=${job.templateId}`} className="btn btn-ink mt-4 w-full">Try another capture</Link>
              </>
            )}
            {(job.status === 'running' || job.status === 'queued') && (
              <p className="mt-5 text-[0.85rem] text-slate">You can leave this page. The document will appear under Documents when it is ready.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
