import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { BookOpen, FileUp, Trash2 } from 'lucide-react'
import { planById } from '@younifyai/shared'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { timeAgo } from '../../lib/format'
import { ConfirmDialog, EmptyState, PageHeader, Spinner } from '../../components/ui'

export default function Knowledge() {
  const { workspace, can } = useAuth()
  const [sources, setSources] = useState(null)
  const [templates, setTemplates] = useState([])
  const [form, setForm] = useState({ title: '', templateId: '', text: '' })
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const fileRef = useRef(null)
  const limit = planById(workspace?.plan).limits.sources

  const load = () => api.listSources().then(setSources).catch((e) => setError(e))
  useEffect(() => {
    document.title = 'Knowledge · YounifyAI'
    load()
    api.listTemplates().then(setTemplates).catch(() => {})
  }, [])

  const full = limit != null && sources && sources.length >= limit

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.addSource({ title: form.title, templateId: form.templateId || null, text: form.text, file })
      toast.success(`Added ${form.title}.`)
      setForm({ title: '', templateId: '', text: '' })
      setFile(null)
      load()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const tplName = (id) => templates.find((t) => t.id === id)?.name || 'All templates'

  return (
    <div>
      <PageHeader
        eyebrow="Knowledge"
        title="Reference material"
        description="During the Retrieve step, YounifyAI searches these sources so documents follow your rules: price lists for bills, a syllabus for notes, a policy for reports."
      />

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_24rem]">
        <section aria-labelledby="src-title">
          <div className="flex items-baseline justify-between">
            <h2 id="src-title" className="font-display text-xl font-semibold tracking-tight">Sources</h2>
            <span className="mono text-[0.7rem] text-slate">{sources?.length ?? '–'} / {limit ?? '∞'} on your plan</span>
          </div>
          <div className="mt-4">
            {!sources && <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="skeleton h-28" />)}</div>}
            {sources?.length === 0 && <EmptyState icon={BookOpen} title="No reference material yet" body="Add a price list, a syllabus or a policy. It is used every time a matching template runs." />}
            <ul className="space-y-3">
              {sources?.map((s) => (
                <li key={s.id} className="card p-5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{s.title}</p>
                      <p className="mt-0.5 text-[0.8rem] text-slate">{tplName(s.templateId)} · {s.chars.toLocaleString('en-IN')} characters · added {timeAgo(s.createdAt)}</p>
                    </div>
                    {can('edit') && (
                      <button type="button" onClick={() => setDeleting(s)} className="grid h-8 w-8 place-items-center rounded-lg text-slate hover:bg-paper hover:text-bad" aria-label={`Delete ${s.title}`}><Trash2 size={16} /></button>
                    )}
                  </div>
                  <pre className="mono mt-3 max-h-24 overflow-hidden whitespace-pre-wrap rounded-lg bg-paper px-3 py-2 text-[0.7rem] leading-relaxed text-ink/80">{s.preview}</pre>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {can('edit') && (
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <form onSubmit={submit} className="card space-y-4 p-5">
              <h2 className="font-display text-lg font-semibold tracking-tight">Add a source</h2>
              {error && <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2.5 text-[0.85rem] text-bad">{error.message}</p>}
              {full && <p className="rounded-xl bg-amber/15 px-3 py-2.5 text-[0.85rem]">Your plan allows {limit} source{limit > 1 ? 's' : ''}. Delete one or upgrade to add more.</p>}
              <div>
                <label htmlFor="src-title-in" className="field-label">Title</label>
                <input id="src-title-in" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Store price list" />
              </div>
              <div>
                <label htmlFor="src-tpl" className="field-label">Used by</label>
                <select id="src-tpl" className="input" value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
                  <option value="">All templates</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="src-text" className="field-label">Content</label>
                <textarea id="src-text" rows={7} className="input mono text-[0.78rem]" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} disabled={!!file} placeholder={'Basmati rice | kg | 120\nMustard oil | L | 180'} />
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" className="btn btn-line btn-sm" onClick={() => fileRef.current?.click()}><FileUp size={15} aria-hidden="true" />{file ? 'Change file' : 'Or choose a file'}</button>
                  {file && <span className="min-w-0 flex-1 truncate text-[0.8rem]">{file.name}</span>}
                  {file && <button type="button" className="text-[0.8rem] font-semibold text-slate hover:text-bad" onClick={() => setFile(null)}>Remove</button>}
                </div>
                <input ref={fileRef} type="file" accept=".txt,.md,.csv,.pdf,.docx" className="sr-only" onChange={(e) => { setFile(e.target.files[0] || null); e.target.value = '' }} />
              </div>
              <button type="submit" disabled={busy || full} className="btn btn-ink w-full">{busy && <Spinner size={14} />}Add source</button>
            </form>
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.title}?`}
        body="Future documents will no longer use it. Documents already made are not changed."
        confirmLabel="Delete source"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try { await api.deleteSource(deleting.id); toast.success('Source deleted.'); load() } catch (e) { toast.error(e.message) }
          setDeleting(null)
        }}
      />
    </div>
  )
}
