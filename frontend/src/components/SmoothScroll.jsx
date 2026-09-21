import { createContext, useContext, useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'
import { gsap, ScrollTrigger, heroState, prefersReducedMotion } from '../lib/motion'

const LenisContext = createContext(null)
export const useLenis = () => useContext(LenisContext)

/** Scroll to an in-page anchor with Lenis when it is running, natively otherwise. */
export function useScrollTo() {
  const lenis = useLenis()
  return (target, opts = {}) => {
    if (lenis) lenis.scrollTo(target, { offset: -8, duration: 1.4, ...opts })
    else document.querySelector(target)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }
}

/** Lenis smooth scrolling, driven by the GSAP ticker so ScrollTrigger stays in sync. */
export default function SmoothScroll({ children }) {
  const [lenis, setLenis] = useState(null)
  const rafRef = useRef(null)

  useEffect(() => {
    if (prefersReducedMotion()) return undefined
    const instance = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9, smoothWheel: true })
    instance.on('scroll', (e) => {
      heroState.velocity = e.velocity
      ScrollTrigger.update()
    })
    const tick = (time) => instance.raf(time * 1000)
    rafRef.current = tick
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    setLenis(instance)
    return () => {
      gsap.ticker.remove(tick)
      instance.destroy()
      setLenis(null)
    }
  }, [])

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
}
