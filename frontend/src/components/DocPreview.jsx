import { inr, shortDate } from '../lib/format'

function show(type, v) {
  if (v == null || v === '') return <span className="text-slate/70">—</span>
  if (type === 'money') return inr(v)
  if (type === 'date') return shortDate(v)
  return String(v)
}

/**
 * Read-only rendering of a document from its template schema.
 * The same component renders landing-page specimens and in-app previews.
 */
export default function DocPreview({ template, content, compact = false, className = '' }) {
  if (!template || !content) return null
  const heading = content.title || (content.bill_no ? `${template.name} #${content.bill_no}` : template.name)
  const scalars = template.fields.filter((f) => ['text', 'date', 'number', 'money'].includes(f.type) && f.key !== 'title')
  const blocks = template.fields.filter((f) => ['longtext', 'list', 'table'].includes(f.type))
  const totals = template.id === 'voice_bill'
  return (
    <article className={`text-ink ${className}`}>
      <p className="eyebrow text-slate">{template.name}</p>
      <h3 className={`mt-2 font-display font-bold tracking-[-0.02em] ${compact ? 'text-xl' : 'text-2xl md:text-[1.7rem]'} leading-tight`}>{heading}</h3>
      {!!scalars.length && (
        <dl className={`mt-4 grid gap-x-6 gap-y-2 border-y border-fog py-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {scalars
            .filter((f) => !(totals && ['subtotal', 'tax', 'total'].includes(f.key)))
            .map((f) => (
              <div key={f.key} className="min-w-0">
                <dt className="mono text-[0.625rem] uppercase tracking-[0.08em] text-slate">{f.label}</dt>
                <dd className="truncate text-[0.9rem] font-medium">{show(f.type, content[f.key])}</dd>
              </div>
            ))}
        </dl>
      )}
      <div className={`${compact ? 'mt-3 space-y-4' : 'mt-5 space-y-6'}`}>
        {blocks.map((f) => {
          const v = content[f.key]
          if (f.type === 'longtext') {
            if (!v) return null
            return (
              <section key={f.key}>
                <h4 className="mono text-[0.625rem] uppercase tracking-[0.08em] text-slate">{f.label}</h4>
                <p className={`mt-1.5 leading-relaxed ${compact ? 'line-clamp-3 text-[0.875rem]' : 'text-[0.95rem]'}`}>{v}</p>
              </section>
            )
          }
          if (f.type === 'list') {
            if (!v?.length) return null
            return (
              <section key={f.key}>
                <h4 className="mono text-[0.625rem] uppercase tracking-[0.08em] text-slate">{f.label}</h4>
                <ul className={`mt-1.5 space-y-1 ${compact ? 'text-[0.875rem]' : 'text-[0.95rem]'}`}>
                  {(compact ? v.slice(0, 3) : v).map((item, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-amber" />
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          }
          if (!v?.length) return null
          const cols = f.columns || []
          return (
            <section key={f.key}>
              <h4 className="mono text-[0.625rem] uppercase tracking-[0.08em] text-slate">{f.label}</h4>
              <div className="mt-1.5 overflow-x-auto">
                <table className={`w-full border-collapse ${compact ? 'text-[0.8rem]' : 'text-[0.9rem]'}`}>
                  <thead>
                    <tr className="border-b border-fog text-left">
                      {cols.map((c) => (
                        <th key={c.key} scope="col" className={`py-1.5 pr-3 font-medium text-slate ${['number', 'money'].includes(c.type) ? 'text-right' : ''}`}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {v.map((row, i) => (
                      <tr key={i} className="border-b border-fog/70 align-top">
                        {cols.map((c) => (
                          <td key={c.key} className={`py-1.5 pr-3 ${['number', 'money'].includes(c.type) ? 'mono text-right text-[0.85em]' : ''}`}>{show(c.type, row[c.key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {totals && f.key === 'items' && (
                    <tfoot>
                      {content.tax ? (
                        <tr><td colSpan={cols.length - 1} className="pt-2 text-right text-slate">Tax</td><td className="mono pt-2 pr-3 text-right text-[0.85em]">{inr(content.tax)}</td></tr>
                      ) : null}
                      <tr>
                        <td colSpan={cols.length - 1} className="pt-2 text-right font-semibold">Total</td>
                        <td className="pt-2 pr-3 text-right"><span className="mono rounded-md bg-amber/25 px-2 py-0.5 font-semibold">{inr(content.total)}</span></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>
          )
        })}
      </div>
    </article>
  )
}
