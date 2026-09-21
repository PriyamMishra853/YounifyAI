import { useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { gsap, useGSAP, useReducedMotion } from '../../lib/motion'
import { ModalityChip } from '../../components/Brand'

const ROWS = [
  { tag: 'EDU', who: 'Student', steps: ['Watch the lecture', 'Screenshot or replay', 'Rewrite notes', 'Lose study time'], result: 'Lecture → Notes', kind: 'video' },
  { tag: 'OPS', who: 'Manager', steps: ['Receive messages', 'Listen to updates', 'Update sheets', 'Prepare reports'], result: 'Messages → Report', kind: 'text' },
  { tag: 'LIFE', who: 'Traveller', steps: ['Take photos', 'Recall the context', 'Write a diary', 'Organise memories'], result: 'Photos → Diary', kind: 'image' },
  { tag: 'BIZ', who: 'Shopkeeper', steps: ['Hear the order', 'Type each item', 'Update Excel', 'Make the bill'], result: 'Voice → Bill', kind: 'voice' },
]

export default function Problem() {
  const root = useRef(null)
  const reduced = useReducedMotion()

  useGSAP(() => {
    if (reduced) return
    gsap.from('.problem-head > *', {
      opacity: 0, y: 30, stagger: 0.1, duration: 1, ease: 'expo.out',
      scrollTrigger: { trigger: '.problem-head', start: 'top 80%' },
    })
    gsap.utils.toArray('.problem-row').forEach((row) => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: 'top 78%', end: 'top 42%', scrub: 0.6 } })
      tl.from(row, { opacity: 0, y: 40, duration: 0.3 })
        .from(row.querySelectorAll('.step'), { opacity: 0, x: -20, stagger: 0.06, duration: 0.3 }, '<0.1')
        .to(row.querySelectorAll('.strike'), { scaleX: 1, duration: 0.18, stagger: 0.1, ease: 'none' })
        .to(row.querySelectorAll('.step'), { opacity: 0.4, duration: 0.2 }, '<0.2')
        .from(row.querySelector('.result'), { opacity: 0, scale: 0.85, duration: 0.25 }, '<')
    })
  }, { scope: root, dependencies: [reduced] })

  return (
    <section ref={root} data-nav-theme="dark" className="relative bg-abyss px-5 py-28 md:px-10 md:py-40" aria-labelledby="problem-title">
      <div className="mx-auto max-w-[1400px]">
        <div className="problem-head max-w-4xl">
          <p className="eyebrow text-amber">The problem</p>
          <h2 id="problem-title" className="display mt-5 text-[clamp(2.3rem,5vw,4.6rem)] text-paper">
            Information is digital.<br />
            <span className="text-mist/70">Documentation is still manual.</span>
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-paper/70">
            Everyday work creates information faster than people can structure it. The same four chores
            show up in a classroom, an office, a trip and a shop.
          </p>
        </div>

        <ol className="mt-16 divide-y divide-white/8 border-y border-white/8 md:mt-24">
          {ROWS.map((r) => (
            <li key={r.tag} className="problem-row grid items-center gap-5 py-7 md:grid-cols-[12rem_1fr_13rem] md:gap-8 md:py-9">
              <div>
                <span className="eyebrow text-mist/70">{r.tag}</span>
                <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-paper">{r.who}</p>
              </div>
              <div className="relative">
                <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
                  {r.steps.map((s, i) => (
                    <li key={s} className="step flex items-center gap-2 text-[0.95rem] text-paper/85">
                      <span className="relative rounded-lg border border-white/10 bg-navy/60 px-3 py-1.5">
                        {s}
                        <span aria-hidden="true" className="strike pointer-events-none absolute inset-x-2 top-1/2 h-[2px] origin-left -translate-y-1/2 scale-x-0 bg-amber" />
                      </span>
                      {i < r.steps.length - 1 && <ArrowRight size={14} className="text-mist/50" aria-hidden="true" />}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="result flex items-center gap-3 md:justify-end">
                <span className="eyebrow text-mist/70 md:hidden">With YounifyAI</span>
                <ModalityChip kind={r.kind}>{r.result}</ModalityChip>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-14 max-w-3xl font-display text-[clamp(1.4rem,2.6vw,2.2rem)] font-medium leading-snug tracking-[-0.02em] text-paper/90">
          Four workflows, five input types, and one missing layer: the intelligence between{' '}
          <span className="text-amber">capture</span> and <span className="text-amber">output</span>.
        </p>
      </div>
    </section>
  )
}
