import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ChevronDown, Copy, Lock, Pencil, Plus, Trash2, X } from 'lucide-react'
import { MODALITY_ORDER } from '@younifyai/shared'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ModalityChip } from '../../components/Brand'
import { ConfirmDialog, Dialog, PageHeader, Spinner } from '../../components/ui'

const TYPES = [
  ['text', 'Short text'], ['longtext', 'Paragraph'], ['number', 'Number'], ['money', 'Amount (₹)'],
  ['date', 'Date'], ['list', 'List'], ['table', 'Table'],
]
const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1') || 'field'

function FieldList({ fields }) {
  return (
    <ul className="mt-3 divide-y divide-fog rounded-xl border border-fog">
      {fields.map((f) => (
        <li key={f.key} className="flex items-center justify-between gap-3 px-3.5 py-2 text-[0.85rem]">
          <span>{f.label}{f.required && <span className="text-bad"> *</span>}</span>
          <span className="mono text-[0.68rem] text-slate">{f.type}{f.columns ? ` · ${f.columns.map((c) => c.label).join(', ')}` : ''}</span>
        </li>
      ))}
    </ul>
  )
}

function TemplateCard({ t, onDuplicate, onEdit, onDelete, canCustom }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="mono text-[0.62rem] uppercase tracking-[0.1em] text-slate">{t.system ? `${t.vertical} · ${t.stage === 'mvp' ? 'MVP' : 'Expansion'}` : 'Custom'}</span>
          <h3 className="mt-1.5 font-display text-xl font-bold tracking-tight">{t.name}</h3>
        </div>
        {!t.system && (
          <div className="flex gap-1">
            <button type="button" onClick={() => onEdit(t)} className="grid h-8 w-8 place-items-center rounded-lg text-slate hover:bg-paper hover:text-ink" aria-label={`Edit ${t.name}`}><Pencil size={15} /></button>
            <button type="button" onClick={() => onDelete(t)} className="grid h-8 w-8 place-items-center rounded-lg text-slate hover:bg-paper hover:text-bad" aria-label={`Delete ${t.name}`}><Trash2 size={15} /></button>
          </div>
        )}
      </div>
      <p className="mt-2 flex-1 text-[0.9rem] text-slate">{t.description}</p>
      <div className="mt-4 flex flex-wrap gap-1">{t.accepts.map((k) => <ModalityChip key={k} kind={k} tone="paper" />)}</div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-4 inline-flex items-center gap-1 self-start text-[0.85rem] font-semibold text-slate hover:text-ink">
        {t.fields.length} fields <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <FieldList fields={t.fields} />}
      <div className="mt-5 flex gap-2 border-t border-fog pt-4">
        <Link to={`/app/capture?template=${t.id}`} className="btn btn-ink btn-sm">Use template</Link>
        {t.system && canCustom && (
          <button type="button" onClick={() => onDuplicate(t)} className="btn btn-line btn-sm"><Copy size={14} aria-hidden="true" />Duplicate</button>
        )}
      </div>
    </li>
  )
}

function TemplateBuilder({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(() => initial || {
    name: '', description: '', instructions: '', accepts: ['voice', 'text', 'docs'],
    fields: [{ key: 'title', label: 'Title', type: 'text', required: true }, { key: 'summary', label: 'Summary', type: 'longtext', required: true }],
  })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const setField = (i, patch) => setForm((f) => ({ ...f, fields: f.fields.map((x, k) => (k === i ? { ...x, ...patch } : x)) }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const payload = { ...form, fields: form.fields.map((f) => ({ ...f, key: f.key || slug(f.label), columns: f.type === 'table' ? (f.columns?.length ? f.columns : [{ key: 'item', label: 'Item', type: 'text' }]) : undefined })) }
      const saved = initial?.id ? await api.updateTemplate(initial.id, payload) : await api.createTemplate(payload)
      onSaved(saved)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={initial?.id ? `Edit ${initial.name}` : 'New template'}
      footer={(
        <>
          <button type="button" className="btn btn-line btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" form="tpl-form" className="btn btn-ink btn-sm" disabled={busy}>{busy && <Spinner size={14} />}Save template</button>
        </>
      )}
    >
      <form id="tpl-form" onSubmit={submit} className="space-y-5">
        {error && <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2.5 text-[0.88rem] text-bad">{error.fields ? Object.values(error.fields).join(' ') : error.message}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tpl-name" className="field-label">Name</label>
            <input id="tpl-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Site inspection report" required />
          </div>
          <div>
            <label htmlFor="tpl-desc" className="field-label">Description</label>
            <input id="tpl-desc" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this document is for" />
          </div>
        </div>
        <div>
          <label htmlFor="tpl-ins" className="field-label">Instructions for the AI</label>
          <textarea id="tpl-ins" rows={3} className="input" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="For example: use metric units; list safety issues first." />
        </div>
        <fieldset>
          <legend className="field-label">Accepted inputs</legend>
          <div className="flex flex-wrap gap-2">
            {MODALITY_ORDER.map((k) => {
              const on = form.accepts.includes(k)
              return (
                <label key={k} className={`cursor-pointer rounded-full ${on ? '' : 'opacity-45'} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber`}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => setForm((f) => ({ ...f, accepts: on ? f.accepts.filter((x) => x !== k) : [...f.accepts, k] }))} />
                  <ModalityChip kind={k} tone="paper" />
                </label>
              )
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="field-label">Fields</legend>
          <ul className="space-y-2">
            {form.fields.map((f, i) => (
              <li key={i} className="rounded-xl border border-fog p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto_auto] sm:items-center">
                  <input className="input h-10" value={f.label} aria-label={`Field ${i + 1} label`} placeholder="Label" onChange={(e) => setField(i, { label: e.target.value, key: initial?.id ? f.key : slug(e.target.value) })} />
                  <select className="input h-10" value={f.type} aria-label={`Field ${i + 1} type`} onChange={(e) => setField(i, { type: e.target.value })}>
                    {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-[0.85rem]"><input type="checkbox" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} />Required</label>
                  <button type="button" onClick={() => setForm((x) => ({ ...x, fields: x.fields.filter((_, k) => k !== i) }))} className="grid h-9 w-9 place-items-center rounded-lg text-slate hover:bg-paper hover:text-bad" aria-label={`Remove field ${f.label || i + 1}`}><X size={16} /></button>
                </div>
                {f.type === 'table' && (
                  <div className="mt-2">
                    <label className="field-label" htmlFor={`cols-${i}`}>Columns (comma-separated)</label>
                    <input
                      id={`cols-${i}`}
                      className="input h-10"
                      defaultValue={(f.columns || []).map((c) => c.label).join(', ')}
                      placeholder="Item, Qty, Remarks"
                      onBlur={(e) => setField(i, { columns: e.target.value.split(',').map((s) => s.trim()).filter(Boolean).map((label) => ({ key: slug(label), label, type: /qty|quantity|count|number/i.test(label) ? 'number' : /amount|price|rate|cost|₹/i.test(label) ? 'money' : 'text' })) })}
                    />
                  </div>
                )}
                <p className="mono mt-1.5 text-[0.65rem] text-slate">key: {f.key || slug(f.label)}</p>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setForm((x) => ({ ...x, fields: [...x.fields, { key: '', label: '', type: 'text' }] }))} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.85rem] font-semibold text-slate hover:bg-paper hover:text-ink">
            <Plus size={15} aria-hidden="true" />Add field
          </button>
        </fieldset>
      </form>
    </Dialog>
  )
}

export default function Templates() {
  const { workspace, can } = useAuth()
  const [templates, setTemplates] = useState(null)
  const [editing, setEditing] = useState(null) // template | {} for new
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const pro = workspace?.plan === 'pro'
  const canCustom = pro && can('edit')

  const load = () => api.listTemplates().then(setTemplates).catch((e) => toast.error(e.message))
  useEffect(() => { document.title = 'Templates · YounifyAI'; load() }, [])

  const system = templates?.filter((t) => t.system) || []
  const custom = templates?.filter((t) => !t.system) || []

  return (
    <div>
      <PageHeader
        eyebrow="Templates"
        title="What each document looks like"
        description="A template is a field schema plus instructions. The generator fills it, the validator checks it, and the editor is built from it."
        actions={canCustom && <button type="button" className="btn btn-ink" onClick={() => setEditing({})}><Plus size={18} aria-hidden="true" />New template</button>}
      />

      <h2 className="mt-10 font-display text-xl font-semibold tracking-tight">Built in</h2>
      <ul className="mt-4 grid gap-4 md:grid-cols-2">
        {!templates && [0, 1, 2, 3].map((i) => <li key={i} className="skeleton h-56" />)}
        {system.map((t) => (
          <TemplateCard key={t.id} t={t} canCustom={canCustom} onDuplicate={(x) => setEditing({ ...x, id: undefined, system: false, name: `${x.name} (copy)` })} />
        ))}
      </ul>

      <h2 className="mt-14 font-display text-xl font-semibold tracking-tight">Custom</h2>
      {!pro ? (
        <div className="card mt-4 flex flex-col items-start gap-4 p-6 md:flex-row md:items-center">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink text-amber"><Lock size={20} aria-hidden="true" /></span>
          <div className="flex-1">
            <p className="font-semibold">Custom templates are part of Pro.</p>
            <p className="text-[0.92rem] text-slate">Define your own fields, like an inspection checklist or a patient visit note, and YounifyAI will fill them.</p>
          </div>
          {can('admin') && <Link to="/app/settings?tab=plan" className="btn btn-amber btn-sm">See plans</Link>}
        </div>
      ) : custom.length === 0 ? (
        <p className="card mt-4 p-6 text-[0.95rem] text-slate">No custom templates yet. Create one, or duplicate a built-in template and change its fields.</p>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {custom.map((t) => <TemplateCard key={t.id} t={t} canCustom={canCustom} onEdit={setEditing} onDelete={setDeleting} />)}
        </ul>
      )}

      {editing && (
        <TemplateBuilder
          initial={editing.fields ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={(t) => { setEditing(null); toast.success(`Saved ${t.name}.`); load() }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name}?`}
        body="Documents already made from it keep their content, but you will not be able to edit them as structured fields."
        confirmLabel="Delete template"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          setBusy(true)
          try { await api.deleteTemplate(deleting.id); toast.success('Template deleted.'); load() } catch (e) { toast.error(e.message) }
          setBusy(false)
          setDeleting(null)
        }}
      />
    </div>
  )
}
