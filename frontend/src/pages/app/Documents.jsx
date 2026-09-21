import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { FileText, Plus, Search, TriangleAlert } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { timeAgo } from '../../lib/format'
import { EmptyState, PageHeader, StatusBadge } from '../../components/ui'

const STATUSES = [['', 'All'], ['draft', 'Needs review'], ['approved', 'Approved']]

export default function Documents() {
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const [docs, setDocs] = useState(null)
  const [templates, setTemplates] = useState([])
  const [error, setError] = useState(null)
  const q = params.get('q') || ''
  const status = params.get('status') || ''
  const templateId = params.get('template') || ''
  const sort = params.get('sort') || 'updated'
  const [query, setQuery] = useState(q)

  const set = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v); else next.delete(k)
    setParams(next, { replace: true })
  }

  useEffect(() => { document.title = 'Documents · YounifyAI'; api.listTemplates().then(setTemplates).catch(() => {}) }, [])
  useEffect(() => {
    const t = setTimeout(() => { if (query !== q) set('q', query) }, 250)
    return () => clearTimeout(t)
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDocs(null)
    api.listDocuments({ q, status, templateId, sort }).then(setDocs).catch(setError)
  }, [q, status, templateId, sort])

  const filtered = !!(q || status || templateId)
  const tplName = useMemo(() => Object.fromEntries(templates.map((t) => [t.id, t.name])), [templates])

  return (
    <div>
      <PageHeader
        eyebrow="Library"
        title="Documents"
        description="Everything YounifyAI has drafted in this workspace. Drafts wait for review; approved documents are ready to share."
        actions={can('edit') && <Link to="/app/capture" className="btn btn-ink"><Plus size={18} aria-hidden="true" />New capture</Link>}
      />

      <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles and content" className="input h-11 pl-10" aria-label="Search documents" />
        </div>
        <div className="flex flex-wrap gap-2">
          <div role="group" aria-label="Status" className="flex rounded-full border border-fog bg-card p-1">
            {STATUSES.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={status === v} onClick={() => set('status', v)} className={`rounded-full px-3.5 py-1.5 text-[0.85rem] font-medium ${status === v ? 'bg-ink text-paper' : 'text-slate hover:text-ink'}`}>{l}</button>
            ))}
          </div>
          <select value={templateId} onChange={(e) => set('template', e.target.value)} className="input h-11 w-auto" aria-label="Template">
            <option value="">All templates</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={sort} onChange={(e) => set('sort', e.target.value)} className="input h-11 w-auto" aria-label="Sort">
            <option value="updated">Recently updated</option>
            <option value="created">Newest first</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>
      </div>

      <div className="mt-6">
        {error && <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-bad">{error.message}</p>}
        {!docs && !error && <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[4.5rem]" />)}</div>}
        {docs && docs.length === 0 && (
          filtered ? (
            <EmptyState icon={Search} title="Nothing matches" body="Try a different search, or clear the filters." action={<button type="button" className="btn btn-line" onClick={() => { setQuery(''); setParams({}) }}>Clear filters</button>} />
          ) : (
            <EmptyState icon={FileText} title="Your library is empty" body="Capture a lecture, a meeting or a voice order and the draft lands here." action={can('edit') && <Link to="/app/capture" className="btn btn-ink">New capture</Link>} />
          )
        )}
        {docs && docs.length > 0 && (
          <div className="card overflow-hidden">
            <table className="w-full text-left">
              <thead className="border-b border-fog bg-paper/60">
                <tr className="text-[0.75rem] uppercase tracking-[0.06em] text-slate">
                  <th scope="col" className="mono px-5 py-3 font-medium">Document</th>
                  <th scope="col" className="mono hidden px-5 py-3 font-medium md:table-cell">Template</th>
                  <th scope="col" className="mono hidden px-5 py-3 font-medium sm:table-cell">Updated</th>
                  <th scope="col" className="mono px-5 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fog">
                {docs.map((d) => {
                  const errors = d.issues.filter((i) => i.level === 'error').length
                  const warns = d.issues.length - errors
                  return (
                    <tr key={d.id} className="group relative transition-colors hover:bg-paper/60">
                      <td className="px-5 py-4">
                        <Link to={`/app/documents/${d.id}`} className="font-semibold after:absolute after:inset-0 focus-visible:outline-none group-has-[:focus-visible]:underline">
                          {d.title}
                        </Link>
                        <p className="mt-0.5 line-clamp-1 max-w-xl text-[0.82rem] text-slate">{d.excerpt || '—'}</p>
                      </td>
                      <td className="hidden px-5 py-4 text-[0.88rem] md:table-cell">{tplName[d.templateId] || d.templateName}{d.sample && <span className="ml-2 chip bg-paper-2 text-slate">sample</span>}</td>
                      <td className="hidden whitespace-nowrap px-5 py-4 text-[0.85rem] text-slate sm:table-cell">{timeAgo(d.updatedAt)}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {d.status !== 'approved' && (errors > 0 || warns > 0) && (
                            <span className={`hidden items-center gap-1 text-[0.78rem] lg:flex ${errors ? 'text-bad' : 'text-warn'}`}>
                              <TriangleAlert size={13} aria-hidden="true" />{errors || warns}
                            </span>
                          )}
                          <StatusBadge status={d.status} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
