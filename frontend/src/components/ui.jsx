import { useEffect, useId, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow text-slate">{eyebrow}</p>}
        <h1 className="mt-1.5 font-display text-[2rem] font-bold leading-tight tracking-[-0.03em] md:text-[2.4rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[0.98rem] text-slate">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

const STATUS = {
  draft: { label: 'Needs review', cls: 'bg-amber/20 text-amber-ink' },
  approved: { label: 'Approved', cls: 'bg-ok/15 text-ok' },
  running: { label: 'Processing', cls: 'bg-m-text/12 text-m-text' },
  queued: { label: 'Queued', cls: 'bg-paper-2 text-slate' },
  succeeded: { label: 'Done', cls: 'bg-ok/15 text-ok' },
  failed: { label: 'Failed', cls: 'bg-bad/12 text-bad' },
}

export function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, cls: 'bg-paper-2 text-slate' }
  return <span className={`chip ${s.cls}`}>{s.label}</span>
}

export function Spinner({ size = 16, className = '' }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} aria-hidden="true" />
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      {Icon && <span className="grid h-12 w-12 place-items-center rounded-2xl bg-paper-2 text-ink"><Icon size={22} aria-hidden="true" /></span>}
      <h2 className="mt-4 font-display text-xl font-semibold tracking-tight">{title}</h2>
      {body && <p className="mt-2 max-w-md text-[0.95rem] text-slate">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/** Dropdown menu: a button plus a list of actions. Closes on outside click and Escape. */
export function Menu({ label, icon, items, align = 'right', buttonClass = 'btn btn-line btn-sm' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const id = useId()
  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" className={buttonClass} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {icon}{label}
      </button>
      {open && (
        <ul id={id} role="menu" className={`animate-rise absolute z-30 mt-2 min-w-[13rem] overflow-hidden rounded-xl border border-fog bg-card py-1.5 shadow-[0_20px_40px_-20px_rgba(22,32,42,0.35)] ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {items.map((it) => (
            <li key={it.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => { setOpen(false); it.onSelect() }}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[0.9rem] hover:bg-paper disabled:opacity-45 ${it.danger ? 'text-bad' : 'text-ink'}`}
              >
                {it.icon}
                <span className="flex-1">{it.label}</span>
                {it.hint && <span className="mono text-[0.65rem] text-slate">{it.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Modal built on <dialog> so focus trapping and Escape come from the browser. */
export function Dialog({ open, onClose, title, children, footer, wide = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className={`m-auto w-[calc(100%-2rem)] rounded-2xl border border-fog bg-card p-0 text-ink shadow-2xl backdrop:bg-ink/40 backdrop:backdrop-blur-sm ${wide ? 'max-w-3xl' : 'max-w-md'}`}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="border-b border-fog px-6 py-4">
            <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-fog px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

export function ConfirmDialog({ open, onCancel, onConfirm, title, body, confirmLabel, danger = true, busy }) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={(
        <>
          <button type="button" className="btn btn-line btn-sm" onClick={onCancel}>Cancel</button>
          <button type="button" className={`btn btn-sm ${danger ? 'bg-bad text-white hover:bg-bad/90' : 'btn-ink'}`} onClick={onConfirm} disabled={busy}>
            {busy && <Spinner size={14} />}{confirmLabel}
          </button>
        </>
      )}
    >
      <p className="text-[0.95rem] text-slate">{body}</p>
    </Dialog>
  )
}

export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar flex gap-1 overflow-x-auto border-b border-fog">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={`-mb-px shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-[0.88rem] font-medium transition-colors ${value === t.value ? 'border-ink text-ink' : 'border-transparent text-slate hover:text-ink'}`}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-paper-2 px-1.5 text-[0.7rem] text-slate">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function UsageMeter({ usage, tone = 'paper' }) {
  if (!usage) return <div className="skeleton h-10 w-full" />
  const pct = Math.min(100, (usage.used / usage.limit) * 100)
  const left = Math.max(0, usage.limit - usage.used)
  const dark = tone === 'dark'
  return (
    <div>
      <div className="flex items-baseline justify-between text-[0.8rem]">
        <span className={dark ? 'text-paper/80' : 'text-ink'}>
          {usage.unlimited ? `${usage.used} today` : `${usage.used} of ${usage.limit} today`}
        </span>
        <span className={`mono text-[0.65rem] uppercase ${dark ? 'text-mist' : 'text-slate'}`}>{usage.plan}</span>
      </div>
      <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${dark ? 'bg-white/10' : 'bg-paper-2'}`}>
        <div className={`h-full rounded-full ${left === 0 ? 'bg-bad' : 'bg-amber'}`} style={{ width: `${usage.unlimited ? Math.min(100, (usage.used / usage.limit) * 100) : pct}%` }} />
      </div>
      {!usage.unlimited && left <= 1 && (
        <p className={`mt-1.5 text-[0.75rem] ${dark ? 'text-amber' : 'text-amber-ink'}`}>{left === 0 ? 'Daily limit reached.' : '1 document left today.'}</p>
      )}
    </div>
  )
}
