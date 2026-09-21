import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { MODALITY_ORDER } from '@younifyai/shared'
import { gsap, ScrollTrigger, useGSAP, heroState, useReducedMotion } from '../../lib/motion'
import ErrorBoundary from '../../components/ErrorBoundary'
import SplitText from '../../components/SplitText'
import { ModalityChip } from '../../components/Brand'
import { useScrollTo } from '../../components/SmoothScroll'

const HeroScene = lazy(() => import('../../three/HeroScene'))

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/** Static stand-in while three.js loads, or when WebGL is unavailable. */
function Poster() {
  return (
    <div className="absolute inset-0 bg-abyss">
      <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" className="h-full w-full opacity-80" aria-hidden="true">
        <defs>
          <radialGradient id="pg" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#F4A900" stopOpacity="0.35" />
            <stop offset="1" stopColor="#F4A900" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="820" cy="360" r="260" fill="url(#pg)" />
        <path d="M820 200 930 430H710Z" fill="none" stroke="#F4A900" strokeWidth="2" />
        {['#7056C8', '#D95A5A', '#1F9D76', '#2D6CDF', '#F4A900'].map((c, i) => (
          <rect key={c} x={120 + i * 110} y={180 + ((i * 97) % 300)} width="84" height="62" rx="10" fill="#0D2B45" stroke={c} strokeWidth="2" transform={`rotate(${(i - 2) * 9} ${160 + i * 110} ${210 + ((i * 97) % 300)})`} />
        ))}
        {[0, 1, 2].map((i) => (
          <rect key={i} x={960 + i * 70} y={400 + i * 12} width="96" height="128" rx="8" fill="#F7F9FB" opacity={0.92 - i * 0.2} transform={`skewY(-6)`} />
        ))}
      </svg>
    </div>
  )
}

export default function Hero() {
  const root = useRef(null)
  const [inView, setInView] = useState(true)
  const [webgl] = useState(hasWebGL)
  const reduced = useReducedMotion()
  const scrollTo = useScrollTo()

  // stop rendering the canvas once the hero is off-screen
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '100px' })
    io.observe(root.current)
    return () => io.disconnect()
  }, [])

  useGSAP(() => {
    ScrollTrigger.create({
      trigger: root.current,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => { heroState.progress = self.progress },
    })
    if (reduced) return
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, delay: 0.15 })
    // the first line arrives as scattered fragments, the second in strict order
    tl.from('.hero-raw .ch', {
      opacity: 0,
      x: () => gsap.utils.random(-140, 140),
      y: () => gsap.utils.random(-90, 90),
      rotate: () => gsap.utils.random(-70, 70),
      duration: 1.5,
      stagger: { each: 0.03, from: 'random' },
    })
      .from('.hero-doc .ch', { opacity: 0, yPercent: 110, duration: 1.1, stagger: 0.028 }, '-=1.0')
      .from('.hero-fade', { opacity: 0, y: 18, duration: 1, stagger: 0.09 }, '-=0.7')

    gsap.to('.hero-copy', {
      yPercent: -14,
      opacity: 0,
      ease: 'none',
      scrollTrigger: { trigger: root.current, start: 'top top', end: '50% top', scrub: true },
    })
    gsap.to('.hero-cue', {
      opacity: 0,
      scrollTrigger: { trigger: root.current, start: 'top top', end: '12% top', scrub: true },
    })
  }, { scope: root, dependencies: [reduced] })

  return (
    <section id="top" ref={root} data-nav-theme="dark" className="relative h-[185vh] bg-abyss" aria-labelledby="hero-title">
      <div className="sticky top-0 h-svh overflow-hidden">
        <div className="absolute inset-0">
          {webgl ? (
            <ErrorBoundary fallback={<Poster />}>
              <Suspense fallback={<Poster />}>
                <HeroScene active={inView} reduced={reduced} />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <Poster />
          )}
        </div>
        {/* keeps the headline readable over the moving shards */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_55%,rgba(7,24,42,0.82)_0%,rgba(7,24,42,0.35)_45%,rgba(7,24,42,0)_70%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-abyss to-transparent" />

        <div className="hero-copy relative z-10 mx-auto flex h-full max-w-[1400px] flex-col justify-end px-5 pb-8 pt-24 md:justify-center md:px-10 md:pb-24">
          <p className="hero-fade eyebrow flex items-center gap-2 text-mist">
            <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse-dot" />
            Any input <ArrowRight size={12} aria-hidden="true" /> structured document
          </p>
          <h1 id="hero-title" className="display mt-5 text-[clamp(2.9rem,6.4vw,6.6rem)]">
            <SplitText text="Capture anything." className="hero-raw block text-mist/80" />
            <SplitText text="Document everything." className="hero-doc block overflow-hidden pb-[0.06em] text-paper" />
          </h1>
          <p className="hero-fade mt-6 max-w-[34rem] text-[1.05rem] leading-relaxed text-paper/75 md:text-[1.15rem]">
            Lectures, voice notes, photos, chats and files go in. Notes, reports, diaries and bills come out,
            ready for you to review, approve and export.
          </p>
          <div className="hero-fade mt-8 flex flex-wrap gap-3">
            <Link to="/signup" className="btn btn-amber h-12 px-6 text-base" data-cursor="Start">
              Start capturing, free <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <button type="button" onClick={() => scrollTo('#pipeline')} className="btn btn-ghost-dark h-12 px-6 text-base">
              See how it works
            </button>
          </div>
        </div>

        <div className="hero-fade hero-cue absolute inset-x-0 bottom-0 z-10 mx-auto hidden max-w-[1400px] items-end justify-between px-10 pb-7 md:flex">
          <div className="flex items-center gap-3">
            <span className="eyebrow text-mist/70">Inputs</span>
            <div className="flex flex-wrap gap-1.5">
              {MODALITY_ORDER.map((k) => <ModalityChip key={k} kind={k} />)}
            </div>
            <span className="eyebrow ml-4 text-mist/70">Outputs</span>
            <div className="flex gap-1.5">
              {['Notes', 'Report', 'Diary', 'Bill'].map((o) => (
                <span key={o} className="chip bg-paper text-ink">{o}</span>
              ))}
            </div>
          </div>
          <span className="eyebrow flex items-center gap-2 text-mist/70">
            Scroll <ArrowDown size={12} className="animate-bounce" aria-hidden="true" />
          </span>
        </div>
      </div>
    </section>
  )
}
