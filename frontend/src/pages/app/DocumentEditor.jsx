import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ArrowLeft, Calculator, Check, CheckCircle2, Download, MoreHorizontal, RotateCcw, Trash2, TriangleAlert } from 'lucide-react'
import { computeDerived, validateDocument } from '@younifyai/shared'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { bytes, dateTime, downloadBlob, timeAgo } from '../../lib/format'
import { ModalityChip } from '../../components/Brand'
import DocPreview from '../../components/DocPreview'
import { ConfirmDialog, Menu, Spinner, StatusBadge, Tabs } from '../../components/ui'
import { FieldEditor } from './fields'

const ACTIONS = {
  'document.generated': 'Generated',
  'document.edited': 'Edited',
  'document.approved': 'Approved',
  'document.exported': 'Exported',
  'document.restored': 'Restored',
}

function SidePanel({ doc, issues, onJump, versions, audit, onRestore, canEdit }) {
  const [tab, setTab] = useState('checks')
  const errors = issues.filter((i) => i.level === 'error')
  return (
    <div className="card">
      <div className="px-4 pt-3">
        <Tabs
          label="Document details"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'checks', label: 'Checks', count: issues.length || null },
            { value: 'inputs', label: 'Inputs' },
            { value: 'history', label: 'History' },
            { value: 'activity', label: 'Activity' },
          ]}
        />
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-4">
        {tab === 'checks' && (
          issues.length === 0 ? (
            <p className="flex items-center gap-2 text-[0.9rem] text-ok"><CheckCircle2 size={18} aria-hidden="true" />All checks pass.</p>
          ) : (
            <ul className="space-y-2">
              {issues.map((i, k) => (
                <li key={k}>
                  <button type="button" onClick={() => onJump(i.field)} className={`flex w-full gap-2.5 rounded-lg p-2.5 text-left text-[0.85rem] hover:brightness-95 ${i.level === 'error' ? 'bg-bad/10 text-bad' : 'bg-amber/15 text-ink'}`}>
                    <TriangleAlert size={15} className={`mt-0.5 shrink-0 ${i.level === 'error' ? '' : 'text-warn'}`} aria-hidden="true" />
                    {i.message}
                  </button>
                </li>
              ))}
              {errors.length > 0 && <li className="pt-1 text-[0.78rem] text-slate">Errors block approval. Warnings are for your judgement.</li>}
            </ul>
          )
        )}
        {tab === 'inputs' && (
          <ul className="space-y-2">
            {doc.inputs?.length ? doc.inputs.map((i) => (
              <li key={i.name} className="flex items-center gap-2.5 text-[0.88rem]">
                <ModalityChip kind={i.kind} tone="paper" />
                {i.url ? (
                  <a href={i.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium underline-offset-2 hover:underline">{i.name}</a>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{i.name}</span>
                )}
                <span className="mono text-[0.68rem] text-slate">{i.url ? 'YouTube' : bytes(i.size)}</span>
              </li>
            )) : <li className="text-[0.88rem] text-slate">No inputs recorded.</li>}
            {doc.jobId && <li className="pt-2"><Link to={`/app/jobs/${doc.jobId}`} className="text-[0.85rem] font-semibold hover:underline">See how it was processed</Link></li>}
          </ul>
        )}
        {tab === 'history' && (
          !versions ? <div className="skeleton h-24" /> : (
            <ol className="space-y-3">
              {versions.map((v) => (
                <li key={v.id} className="flex items-start gap-3 text-[0.88rem]">
                  <span className="mono mt-0.5 rounded bg-paper-2 px-1.5 text-[0.7rem]">v{v.version}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{v.note}{v.createdBy ? ` by ${v.createdBy.name}` : ' by YounifyAI'}</p>
                    <p className="text-[0.78rem] text-slate">{dateTime(v.createdAt)}</p>
                  </div>
                  {v.version !== doc.version && canEdit && (
                    <button type="button" onClick={() => onRestore(v)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.8rem] font-semibold text-slate hover:bg-paper hover:text-ink">
                      <RotateCcw size={13} aria-hidden="true" />Restore
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )
        )}
        {tab === 'activity' && (
          !audit ? <div className="skeleton h-24" /> : (
            <ol className="space-y-3">
              {audit.map((a) => (
                <li key={a.id} className="text-[0.85rem]">
                  <p><span className="font-semibold">{ACTIONS[a.action] || a.action}</span> <span className="text-slate">{a.detail && `· ${a.detail}`}</span></p>
                  <p className="text-[0.76rem] text-slate">{a.actor ? a.actor.name : 'YounifyAI'} · {timeAgo(a.at)}</p>
                </li>
              ))}
            </ol>
          )
        )}
      </div>
    </div>
  )
}

export default function DocumentEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const canEdit = can('edit')
  const [doc, setDoc] = useState(null)
  const [template, setTemplate] = useState(null)
  const [draft, setDraft] = useState(null)
  const [versions, setVersions] = useState(null)
  const [audit, setAudit] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null) // 'save' | 'approve' | 'export' | 'delete'
  const [confirm, setConfirm] = useState(null) // { kind: 'delete' } | { kind: 'restore', version }

  const loadSide = useCallback(() => {
    api.listVersions(id).then(setVersions).catch(() => {})
    api.listAudit({ documentId: id }).then(setAudit).catch(() => {})
  }, [id])

  const accept = useCallback((d) => {
    setDoc(d)
    setDraft({ title: d.title, content: d.content })
  }, [])

  useEffect(() => {
    setDoc(null)
    Promise.all([api.getDocument(id), api.listTemplates()])
      .then(([d, ts]) => {
        accept(d)
        setTemplate(d.template || ts.find((t) => t.id === d.templateId) || null)
        document.title = `${d.title} · YounifyAI`
      })
      .catch(setError)
    loadSide()
  }, [id, accept, loadSide])

  const dirty = !!doc && !!draft && (draft.title !== doc.title || JSON.stringify(draft.content) !== JSON.stringify(doc.content))
  const issues = useMemo(() => (template && draft ? validateDocument(template, draft.content).issues : []), [template, draft])
  const errors = issues.filter((i) => i.level === 'error').length
  const byField = useMemo(() => issues.reduce((m, i) => ((m[i.field] ||= []).push(i), m), {}), [issues])

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return undefined
    const onUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  const save = useCallback(async () => {
    if (!dirty || busy) return
    setBusy('save')
    try {
      const wasApproved = doc.status === 'approved'
      const d = await api.updateDocument(id, { title: draft.title, content: draft.content, expectedVersion: doc.version })
      accept(d)
      loadSide()
      toast.success(wasApproved ? `Saved as version ${d.version}. Approve again when you are ready.` : `Saved as version ${d.version}.`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }, [dirty, busy, doc, draft, id, accept, loadSide])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  const approve = async () => {
    setBusy('approve')
    try {
      accept(await api.approveDocument(id))
      loadSide()
      toast.success('Approved.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const exportAs = async (format) => {
    setBusy('export')
    try {
      const { blob, filename } = await api.exportDocument(id, format)
      downloadBlob(blob, filename)
      loadSide()
      toast.success(`Exported ${filename}`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const runConfirm = async () => {
    if (confirm.kind === 'delete') {
      setBusy('delete')
      try {
        await api.deleteDocument(id)
        toast.success('Document deleted.')
        setDoc(null)
        navigate('/app/documents', { replace: true })
      } catch (e) {
        toast.error(e.message)
        setBusy(null)
      }
      return
    }
    setBusy('save')
    try {
      const d = await api.restoreVersion(id, confirm.version.id)
      accept(d)
      loadSide()
      toast.success(`Restored version ${confirm.version.version} as version ${d.version}.`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(null)
      setConfirm(null)
    }
  }

  const jump = (field) => document.getElementById(`field-${field}-wrap`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  if (error) {
    return (
      <div className="card p-8">
        <p className="font-semibold">{error.message}</p>
        <Link to="/app/documents" className="btn btn-line btn-sm mt-4">Back to documents</Link>
      </div>
    )
  }
  if (!doc || !draft) return <div className="space-y-3"><div className="skeleton h-10 w-80" /><div className="skeleton h-[28rem]" /></div>
  if (!template) return <div className="card p-8">The template for this document was deleted, so it can only be exported as JSON.</div>

  const setContent = (key, v) => setDraft((d) => ({ ...d, content: { ...d.content, [key]: v } }))
  const approveBlocked = dirty ? 'Save your changes first.' : errors ? `Fix ${errors} error${errors > 1 ? 's' : ''} first.` : null

  return (
    <div>
      <div className="sticky top-14 z-20 -mx-4 border-b border-fog bg-paper/90 px-4 py-3 backdrop-blur md:-mx-8 md:px-8 lg:top-0">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/app/documents" className="grid h-9 w-9 place-items-center rounded-lg text-slate hover:bg-card hover:text-ink" aria-label="Back to documents"><ArrowLeft size={18} /></Link>
          <div className="min-w-0 flex-1">
            <p className="mono text-[0.62rem] uppercase tracking-[0.1em] text-slate">{template.name} · v{doc.version}{dirty ? ' · unsaved changes' : ''}</p>
            {canEdit ? (
              <input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                className="w-full truncate bg-transparent font-display text-[1.35rem] font-bold tracking-[-0.02em] outline-none focus:underline focus:decoration-amber focus:decoration-2 focus:underline-offset-4"
                aria-label="Document title"
              />
            ) : (
              <h1 className="truncate font-display text-[1.35rem] font-bold tracking-[-0.02em]">{doc.title}</h1>
            )}
          </div>
          <StatusBadge status={doc.status} />
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <button type="button" onClick={save} disabled={!dirty || !!busy} className="btn btn-line btn-sm" title="Ctrl + S">
                {busy === 'save' && <Spinner size={14} />}Save
              </button>
            )}
            {canEdit && doc.status !== 'approved' && (
              <button type="button" onClick={approve} disabled={!!approveBlocked || !!busy} title={approveBlocked || 'Approve this version'} className="btn btn-sm btn-ink">
                {busy === 'approve' ? <Spinner size={14} /> : <Check size={16} aria-hidden="true" />}Approve
              </button>
            )}
            <Menu
              label="Export"
              icon={busy === 'export' ? <Spinner size={14} /> : <Download size={16} aria-hidden="true" />}
              items={[
                { label: 'PDF', hint: '.pdf', onSelect: () => exportAs('pdf') },
                { label: 'Word', hint: '.docx', onSelect: () => exportAs('docx') },
                { label: 'Markdown', hint: '.md', onSelect: () => exportAs('md') },
                { label: 'JSON', hint: '.json', onSelect: () => exportAs('json') },
              ]}
            />
            {canEdit && (
              <Menu
                label={<span className="sr-only">More actions</span>}
                icon={<MoreHorizontal size={18} aria-hidden="true" />}
                buttonClass="btn btn-line btn-sm px-2.5"
                items={[
                  ...(template.id === 'voice_bill' ? [{ label: 'Recalculate totals', icon: <Calculator size={15} />, onSelect: () => setDraft((d) => ({ ...d, content: computeDerived(template, d.content) })) }] : []),
                  { label: 'Delete document', icon: <Trash2 size={15} />, danger: true, onSelect: () => setConfirm({ kind: 'delete' }) },
                ]}
              />
            )}
          </div>
        </div>
      </div>

      {doc.sample && (
        <p className="mt-5 rounded-xl bg-paper-2 px-4 py-2.5 text-[0.85rem] text-slate">This is a sample document added to your workspace. Edit, approve or delete it freely.</p>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="card min-w-0 p-5 md:p-7">
          {canEdit ? (
            <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save() }}>
              {template.fields.filter((f) => f.key !== 'title').map((f) => (
                <FieldEditor key={f.key} field={f} value={draft.content[f.key]} onChange={(v) => setContent(f.key, v)} issues={byField[f.key]} />
              ))}
            </form>
          ) : (
            <DocPreview template={template} content={doc.content} />
          )}
        </div>
        <aside className="xl:sticky xl:top-24 xl:self-start">
          {doc.status === 'approved' && (
            <p className="mb-4 flex items-center gap-2 rounded-xl bg-ok/12 px-4 py-3 text-[0.88rem] text-ok">
              <CheckCircle2 size={17} aria-hidden="true" />
              Approved{doc.approvedBy ? ` by ${doc.approvedBy.name}` : ''} {timeAgo(doc.approvedAt)}
            </p>
          )}
          <SidePanel doc={doc} issues={issues} onJump={jump} versions={versions} audit={audit} canEdit={canEdit} onRestore={(v) => setConfirm({ kind: 'restore', version: v })} />
        </aside>
      </div>

      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        title="Delete this document?"
        body="The document and all its versions are removed from the workspace. The audit trail keeps a record that it was deleted."
        confirmLabel="Delete document"
        busy={busy === 'delete'}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
      />
      <ConfirmDialog
        open={confirm?.kind === 'restore'}
        danger={false}
        title={`Restore version ${confirm?.version?.version}?`}
        body="Its content becomes a new version. Nothing is lost: the current version stays in the history."
        confirmLabel="Restore"
        busy={busy === 'save'}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Leave without saving?"
        body="Your changes to this document will be lost."
        confirmLabel="Discard changes"
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  )
}
