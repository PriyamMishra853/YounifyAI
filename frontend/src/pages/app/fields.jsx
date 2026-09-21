import { Plus, X } from 'lucide-react'
import { emptyRow } from '@younifyai/shared'

// Editors for each template field type. All are controlled and report the
// whole new value through onChange. Number cells keep what the person typed
// until blur, so "12." can be typed on the way to "12.5".

const numeric = (t) => t === 'number' || t === 'money'
// short text columns get a fixed width; everything else shares the rest
const SHORT = new Set(['unit', 'time', 'owner'])

function toNumberish(v) {
  if (v === '' || v == null) return null
  const n = Number(String(v).replace(/[₹,\s]/g, ''))
  return Number.isFinite(n) ? n : v
}

function Scalar({ type, value, onChange, id, invalid, placeholder, className = '', label }) {
  if (type === 'longtext') {
    return (
      <textarea
        id={id}
        aria-label={label}
        className={`input min-h-[5.5rem] [field-sizing:content] ${className}`}
        value={value ?? ''}
        aria-invalid={invalid}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  if (type === 'date') {
    return <input id={id} aria-label={label} type="date" className={`input ${className}`} value={value ?? ''} aria-invalid={invalid} onChange={(e) => onChange(e.target.value)} />
  }
  if (numeric(type)) {
    return (
      <div className="relative">
        {type === 'money' && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[0.85em] text-slate">₹</span>}
        <input
          id={id}
          aria-label={label}
          inputMode="decimal"
          className={`input mono text-right text-[0.85rem] ${type === 'money' ? 'pl-6' : ''} ${className}`}
          value={value ?? ''}
          aria-invalid={invalid}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(toNumberish(e.target.value))}
        />
      </div>
    )
  }
  return <input id={id} aria-label={label} className={`input ${className}`} value={value ?? ''} aria-invalid={invalid} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

function ListEditor({ field, value = [], onChange, id }) {
  const set = (i, v) => onChange(value.map((x, k) => (k === i ? v : x)))
  const add = () => {
    onChange([...value, ''])
    requestAnimationFrame(() => document.getElementById(`${id}-${value.length}`)?.focus())
  }
  return (
    <div className="space-y-2">
      {value.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-[1.1rem] h-1.5 w-1.5 shrink-0 rounded-full bg-amber" aria-hidden="true" />
          <input
            id={`${id}-${i}`}
            className="input"
            value={item}
            aria-label={`${field.label} ${i + 1}`}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          />
          <button type="button" onClick={() => onChange(value.filter((_, k) => k !== i))} className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate hover:bg-paper hover:text-bad" aria-label={`Remove ${field.label.toLowerCase()} ${i + 1}`}>
            <X size={16} />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.85rem] font-semibold text-slate hover:bg-paper hover:text-ink">
        <Plus size={15} aria-hidden="true" /> Add {field.label.toLowerCase().replace(/s$/, '')}
      </button>
    </div>
  )
}

function TableEditor({ field, value = [], onChange, issues, id }) {
  const cols = field.columns || []
  const set = (r, key, v) => onChange(value.map((row, i) => (i === r ? { ...row, [key]: v } : row)))
  const flagged = new Set(issues.filter((i) => i.row != null).map((i) => `${i.row}:${i.column}`))
  return (
    <div className="overflow-x-auto rounded-xl border border-fog">
      <table className="w-full min-w-[40rem] table-fixed border-collapse text-[0.88rem]">
        <thead className="bg-paper/70">
          <tr>
            {cols.map((c) => (
              <th key={c.key} scope="col" className={`mono px-2 py-2 text-[0.65rem] font-medium uppercase tracking-[0.06em] text-slate ${numeric(c.type) ? 'w-[6.5rem] text-right' : SHORT.has(c.key) || c.type === 'date' ? 'w-[8.5rem] text-left' : 'text-left'}`}>{c.label}</th>
            ))}
            <th className="w-10"><span className="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          {value.map((row, r) => (
            <tr key={r} className="border-t border-fog align-top">
              {cols.map((c) => (
                <td key={c.key} className="p-1.5">
                  <Scalar
                    type={c.type === 'longtext' ? 'text' : c.type}
                    id={`${id}-${r}-${c.key}`}
                    label={`${c.label}, row ${r + 1}`}
                    value={row[c.key]}
                    invalid={flagged.has(`${r}:${c.key}`)}
                    className={`h-9 border-transparent bg-transparent hover:border-fog ${flagged.has(`${r}:${c.key}`) ? '!border-warn bg-amber/10' : ''}`}
                    onChange={(v) => set(r, c.key, v)}
                  />
                </td>
              ))}
              <td className="p-1.5">
                <button type="button" onClick={() => onChange(value.filter((_, i) => i !== r))} className="grid h-9 w-9 place-items-center rounded-lg text-slate hover:bg-paper hover:text-bad" aria-label={`Remove row ${r + 1}`}>
                  <X size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-fog px-2 py-1.5">
        <button type="button" onClick={() => onChange([...value, emptyRow(field)])} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.85rem] font-semibold text-slate hover:bg-paper hover:text-ink">
          <Plus size={15} aria-hidden="true" /> Add row
        </button>
      </div>
    </div>
  )
}

/** One labelled field with its editor and any validation messages. */
export function FieldEditor({ field, value, onChange, issues = [] }) {
  const id = `field-${field.key}`
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')
  return (
    <div id={`${id}-wrap`} className="scroll-mt-28">
      <label htmlFor={field.type === 'list' || field.type === 'table' ? undefined : id} className="field-label">
        {field.label}{field.required && <span className="text-bad" aria-hidden="true"> *</span>}
      </label>
      {field.type === 'list' && <ListEditor field={field} value={value} onChange={onChange} id={id} />}
      {field.type === 'table' && <TableEditor field={field} value={value} onChange={onChange} issues={issues} id={id} />}
      {!['list', 'table'].includes(field.type) && <Scalar type={field.type} id={id} value={value} onChange={onChange} invalid={errors.length > 0} label={field.label} />}
      {[...errors, ...warnings].map((i, k) => (
        <p key={k} className={`mt-1.5 text-[0.82rem] ${i.level === 'error' ? 'text-bad' : 'text-warn'}`}>{i.message}</p>
      ))}
    </div>
  )
}
