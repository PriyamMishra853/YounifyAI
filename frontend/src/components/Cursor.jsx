import { useEffect, useRef, useState } from 'react'
import { gsap, finePointer, prefersReducedMotion } from '../lib/motion'

const INTERACTIVE = 'a, button, [role="button"], input, textarea, select, label, [data-cursor]'

/**
 * A dot that tracks the pointer exactly and a ring that trails it.
 * Over links and buttons the ring grows; elements with data-cursor="Label"
 * show that label inside the ring. Disabled on touch and reduced motion.
 */
export default function Cursor() {
  const dot = useRef(null)
  const ring = useRef(null)
  const [label, setLabel] = useState('')
  const [enabled] = useState(() => finePointer() && !prefersReducedMotion())

  useEffect(() => {
    if (!enabled) return undefined
    document.documentElement.classList.add('cursor-on')
    const xDot = gsap.quickTo(dot.current, 'x', { duration: 0.08, ease: 'power3' })
    const yDot = gsap.quickTo(dot.current, 'y', { duration: 0.08, ease: 'power3' })
    const xRing = gsap.quickTo(ring.current, 'x', { duration: 0.45, ease: 'power3' })
    const yRing = gsap.quickTo(ring.current, 'y', { duration: 0.45, ease: 'power3' })
    let shown = false

    const onMove = (e) => {
      if (!shown) {
        gsap.to([dot.current, ring.current], { autoAlpha: 1, duration: 0.3 })
        shown = true
      }
      xDot(e.clientX); yDot(e.clientY); xRing(e.clientX); yRing(e.clientY)
    }
    const onOver = (e) => {
      const el = e.target.closest?.(INTERACTIVE)
      const text = el?.getAttribute?.('data-cursor') || ''
      setLabel(text)
      const isField = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
      gsap.to(ring.current, {
        scale: text ? 2.6 : el ? (isField ? 0.6 : 1.7) : 1,
        backgroundColor: el && !isField ? 'rgba(244,169,0,0.14)' : 'rgba(244,169,0,0)',
        borderColor: el ? 'rgba(244,169,0,0.9)' : 'rgba(143,163,184,0.55)',
        duration: 0.35,
        ease: 'power3',
      })
      gsap.to(dot.current, { scale: el ? 0 : 1, duration: 0.2 })
    }
    const onLeave = () => gsap.to([dot.current, ring.current], { autoAlpha: 0, duration: 0.2, onComplete: () => { shown = false } })
    const onDown = () => gsap.to(ring.current, { scale: '-=0.25', duration: 0.12 })
    const onUp = (e) => onOver(e)

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerover', onOver)
    document.documentElement.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    return () => {
      document.documentElement.classList.remove('cursor-on')
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerover', onOver)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
    }
  }, [enabled])

  if (!enabled) return null
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100]">
      <div
        ref={ring}
        className="invisible absolute left-0 top-0 -ml-5 -mt-5 flex h-10 w-10 items-center justify-center rounded-full border opacity-0"
        style={{ borderColor: 'rgba(143,163,184,0.55)', mixBlendMode: 'normal' }}
      >
        <span className="mono whitespace-nowrap text-[4.5px] font-medium uppercase tracking-[0.12em] text-amber">
          {label}
        </span>
      </div>
      <div ref={dot} className="invisible absolute left-0 top-0 -ml-[3px] -mt-[3px] h-1.5 w-1.5 rounded-full bg-amber opacity-0" />
    </div>
  )
}
