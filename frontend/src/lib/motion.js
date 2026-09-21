import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { useSyncExternalStore } from 'react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export { gsap, ScrollTrigger, useGSAP }

const reducedQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

export function prefersReducedMotion() {
  return !!reducedQuery?.matches
}

export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      reducedQuery?.addEventListener('change', cb)
      return () => reducedQuery?.removeEventListener('change', cb)
    },
    () => !!reducedQuery?.matches,
    () => false,
  )
}

export const finePointer = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches

/**
 * Mutable state the 3D hero reads every frame. Written by DOM listeners and
 * ScrollTrigger, never by React state, so the canvas never re-renders React.
 */
export const heroState = {
  progress: 0, // 0 → 1 while the hero is scrolled through
  pointer: { x: 0, y: 0 }, // normalized -1 → 1
  velocity: 0, // Lenis scroll velocity, used to spin the prism
}
