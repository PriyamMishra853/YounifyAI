import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Menu, X } from 'lucide-react'
import { Logo } from './Brand'
import { useScrollTo } from './SmoothScroll'
import { useAuth } from '../lib/auth'

const LINKS = [
  { label: 'How it works', hash: '#pipeline' },
  { label: 'Use cases', hash: '#use-cases' },
  { label: 'Trust', hash: '#trust' },
  { label: 'Pricing', to: '/pricing' },
]

/**
 * Fixed top navigation. `theme` follows the section under the bar
 * (dark on the raw-signal half of the page, paper on the document half).
 */
export default function SiteNav({ theme = 'dark' }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { pathname } = useLocation()
  const scrollTo = useScrollTo()
  const { user } = useAuth()
  const dark = theme === 'dark'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => setOpen(false), [pathname])

  const go = (e, hash) => {
    if (pathname !== '/') return // plain link navigates to /#hash
    e.preventDefault()
    setOpen(false)
    scrollTo(hash)
  }

  const surface = scrolled || open
    ? dark
      ? 'bg-abyss/75 border-white/8 backdrop-blur-xl'
      : 'bg-paper/80 border-ink/8 backdrop-blur-xl'
    : 'border-transparent'

  return (
    <header className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-500 ${surface}`}>
      <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-5 md:px-10" aria-label="Main">
        <Logo tone={dark ? 'dark' : 'paper'} />
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.label}>
              {l.to ? (
                <Link to={l.to} className={`rounded-full px-3.5 py-2 text-[0.9rem] font-medium transition-colors ${dark ? 'text-mist hover:text-paper' : 'text-slate hover:text-ink'}`}>
                  {l.label}
                </Link>
              ) : (
                <a href={`/${l.hash}`} onClick={(e) => go(e, l.hash)} className={`rounded-full px-3.5 py-2 text-[0.9rem] font-medium transition-colors ${dark ? 'text-mist hover:text-paper' : 'text-slate hover:text-ink'}`}>
                  {l.label}
                </a>
              )}
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <Link to="/app" className="btn btn-sm btn-amber">Open workspace</Link>
          ) : (
            <>
              <Link to="/login" className={`btn btn-sm ${dark ? 'text-paper hover:bg-white/6' : 'text-ink hover:bg-ink/5'}`}>Sign in</Link>
              <Link to="/signup" className="btn btn-sm btn-amber">Start free</Link>
            </>
          )}
        </div>
        <button
          type="button"
          className={`grid h-10 w-10 place-items-center rounded-full md:hidden ${dark ? 'text-paper' : 'text-ink'}`}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>
      {open && (
        <div id="mobile-menu" className={`border-t px-5 pb-6 pt-2 md:hidden ${dark ? 'border-white/8' : 'border-ink/8'}`}>
          <ul className="flex flex-col">
            {LINKS.map((l) => (
              <li key={l.label}>
                {l.to ? (
                  <Link to={l.to} className={`block py-3 text-lg font-medium ${dark ? 'text-paper' : 'text-ink'}`}>{l.label}</Link>
                ) : (
                  <a href={`/${l.hash}`} onClick={(e) => go(e, l.hash)} className={`block py-3 text-lg font-medium ${dark ? 'text-paper' : 'text-ink'}`}>{l.label}</a>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            {user ? (
              <Link to="/app" className="btn btn-amber flex-1">Open workspace</Link>
            ) : (
              <>
                <Link to="/login" className={`btn flex-1 ${dark ? 'btn-ghost-dark' : 'btn-line'}`}>Sign in</Link>
                <Link to="/signup" className="btn btn-amber flex-1">Start free</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
