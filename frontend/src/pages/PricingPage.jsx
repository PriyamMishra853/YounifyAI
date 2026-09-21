import { useEffect } from 'react'
import { Check, Minus } from 'lucide-react'
import MarketingLayout from '../components/MarketingLayout'
import PricingPlans from '../components/PricingPlans'

const ROWS = [
  ['Documents per day', '5', '50', 'Unlimited*'],
  ['Inputs: voice, video, image, text, docs', true, true, true],
  ['Starter templates (notes, report, diary, bill)', true, true, true],
  ['Custom templates', false, false, true],
  ['Reference material for retrieval', '3 sources', '20 sources', 'Unlimited'],
  ['Export', 'PDF, Markdown', 'PDF, DOCX, JSON, Markdown', 'PDF, DOCX, JSON, Markdown'],
  ['History', '30 days', 'Unlimited', 'Unlimited'],
  ['Storage', '500 MB', '5 GB', '50 GB'],
  ['Workspace members and roles', false, false, true],
  ['Audit trail export', false, false, true],
]

const FAQ = [
  ['What counts as a document?', 'One capture turned into one document. A capture can hold several files: a lecture video plus three board photos is one document.'],
  ['When does the daily limit reset?', 'At midnight India time. Documents you already made stay in your library.'],
  ['What does fair use on Pro mean?', 'Pro is unlimited for normal team use, capped at 500 documents a day to keep AI costs predictable. Talk to us if you need more.'],
  ['Can I edit what the AI produces?', 'Always. Every document starts as a draft. You edit, then approve. Editing an approved document withdraws the approval until you approve again.'],
  ['Where is my data stored?', 'In a PostgreSQL database with row-level security, so one workspace can never read another’s documents.'],
]

function Cell({ v, dark }) {
  if (v === true) return <Check size={18} className={dark ? 'text-amber' : 'text-ok'} aria-label="Included" />
  if (v === false) return <Minus size={18} className="text-mist" aria-label="Not included" />
  return <span>{v}</span>
}

export default function PricingPage() {
  useEffect(() => { document.title = 'Pricing · YounifyAI' }, [])
  return (
    <MarketingLayout navTheme="paper">
      <div className="bg-paper px-5 pb-28 pt-36 text-ink md:px-10">
        <div className="mx-auto max-w-[1400px]">
          <p className="eyebrow text-amber-ink">Pricing</p>
          <h1 className="display mt-4 max-w-4xl text-[clamp(2.6rem,5.4vw,5rem)]">Pay when documentation becomes a workflow.</h1>
          <p className="mt-5 max-w-xl text-lg text-slate">Start free. Upgrade when you document every day, or when your team does.</p>
          <div className="mt-14"><PricingPlans /></div>

          <h2 className="mt-28 font-display text-3xl font-bold tracking-tight">Compare plans</h2>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-fog bg-card">
            <table className="w-full min-w-[40rem] text-[0.95rem]">
              <thead>
                <tr className="border-b border-fog text-left">
                  <th scope="col" className="px-5 py-4 font-medium text-slate">Feature</th>
                  {['Free', 'Premium', 'Pro'].map((p) => <th key={p} scope="col" className="px-5 py-4 font-display text-lg font-bold">{p}</th>)}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, ...vals]) => (
                  <tr key={label} className="border-b border-fog last:border-0">
                    <th scope="row" className="px-5 py-3.5 text-left font-normal">{label}</th>
                    {vals.map((v, i) => <td key={i} className="px-5 py-3.5"><Cell v={v} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[0.85rem] text-slate">*Fair use: 500 documents a day. Indicative Ideathon pricing; final limits follow real compute costs.</p>

          <h2 className="mt-28 font-display text-3xl font-bold tracking-tight">Questions</h2>
          <dl className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {FAQ.map(([q, a]) => (
              <div key={q}>
                <dt className="font-display text-lg font-semibold">{q}</dt>
                <dd className="mt-2 leading-relaxed text-slate">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </MarketingLayout>
  )
}
