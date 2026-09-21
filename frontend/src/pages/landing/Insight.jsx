import { useRef } from 'react'
import { gsap, useGSAP, useReducedMotion } from '../../lib/motion'

const CHAIN = [
  { word: 'Input', note: 'Any information you already have' },
  { word: 'Understand', note: 'Extract the meaning and context' },
  { word: 'Structure', note: 'Apply the template and your rules' },
  { word: 'Output', note: 'A document ready for your review' },
]

export default function Insight() {
  const root = useRef(null)
  const reduced = useReducedMotion()

  useGSAP(() => {
    if (reduced) return
    const tl = gsap.timeline({
      scrollTrigger: { trigger: root.current, start: 'top 65%', end: 'bottom 70%', scrub: 0.5 },
    })
    gsap.utils.toArray('.chain-step').forEach((el, i) => {
      tl.fromTo(el.querySelector('.chain-word'), { color: 'rgba(143,163,184,0.28)' }, { color: i === 3 ? '#F4A900' : '#EEF2F6', duration: 1 }, i)
        .fromTo(el.querySelector('.chain-note'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.8 }, i + 0.2)
    })
  }, { scope: root, dependencies: [reduced] })

  return (
    <section ref={root} data-nav-theme="dark" className="bg-abyss px-5 pb-32 pt-8 md:px-10 md:pb-48" aria-labelledby="insight-title">
      <div className="mx-auto max-w-[1400px]">
        <p className="eyebrow text-amber">The insight</p>
        <h2 id="insight-title" className="mt-5 max-w-3xl text-[clamp(1.5rem,2.8vw,2.4rem)] font-medium leading-snug tracking-[-0.01em] text-paper/85">
          We are not solving four problems. We are solving one: turning unstructured information into structured, useful work.
        </h2>
        <ol className="mt-14 grid gap-8 md:mt-20 md:grid-cols-4 md:gap-4">
          {CHAIN.map((c, i) => (
            <li key={c.word} className="chain-step relative">
              <span className="eyebrow text-mist/60">Step {i + 1} of 4</span>
              <p className="chain-word display mt-2 text-[clamp(2.4rem,3.7vw,3.9rem)]" style={{ color: reduced ? '#EEF2F6' : undefined }}>
                {c.word}
              </p>
              <p className="chain-note mt-3 max-w-[16rem] text-[0.95rem] text-mist">{c.note}</p>
            </li>
          ))}
        </ol>
        <p className="mt-16 max-w-2xl text-lg leading-relaxed text-paper/70">
          That makes YounifyAI a platform rather than a feature. One engine, with a different template and
          different reference material for each kind of work.
        </p>
      </div>
    </section>
  )
}
