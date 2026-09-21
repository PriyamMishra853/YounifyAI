import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import MarketingLayout from '../components/MarketingLayout'
import { useScrollTo } from '../components/SmoothScroll'
import { ScrollTrigger, useGSAP } from '../lib/motion'
import Hero from './landing/Hero'
import Problem from './landing/Problem'
import Insight from './landing/Insight'
import Pipeline from './landing/Pipeline'
import UseCases from './landing/UseCases'
import Trust from './landing/Trust'
import { PricingSection, RoadmapSection, FinalCta } from './landing/PricingRoadmap'

/** Scrolls to /#hash targets after the pinned sections have been measured. */
function HashScroller() {
  const { hash } = useLocation()
  const scrollTo = useScrollTo()
  useEffect(() => {
    if (!hash) return undefined
    const t = setTimeout(() => {
      ScrollTrigger.refresh()
      scrollTo(hash, { immediate: true })
    }, 350)
    return () => clearTimeout(t)
  }, [hash]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export default function Landing() {
  const [navTheme, setNavTheme] = useState('dark')
  const root = useRef(null)

  // the nav takes the theme of whichever section is under it
  useGSAP(() => {
    root.current.querySelectorAll('[data-nav-theme]').forEach((el) => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 32px',
        end: 'bottom 32px',
        onToggle: (self) => self.isActive && setNavTheme(el.dataset.navTheme),
      })
    })
  }, { scope: root })

  useEffect(() => {
    document.title = 'YounifyAI — Capture anything. Document everything.'
  }, [])

  return (
    <MarketingLayout navTheme={navTheme}>
      <HashScroller />
      <div ref={root}>
        <Hero />
        <Problem />
        <Insight />
        <Pipeline onTheme={setNavTheme} />
        <UseCases />
        <Trust />
        <PricingSection />
        <RoadmapSection />
        <FinalCta />
      </div>
    </MarketingLayout>
  )
}
