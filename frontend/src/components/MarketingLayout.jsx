import SmoothScroll from './SmoothScroll'
import Cursor from './Cursor'
import SiteNav from './SiteNav'
import SiteFooter from './SiteFooter'

/** Public pages: smooth scroll, custom cursor, adaptive nav, footer. */
export default function MarketingLayout({ navTheme = 'dark', children, footer = true }) {
  return (
    <SmoothScroll>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-amber focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <Cursor />
      <SiteNav theme={navTheme} />
      <main id="main">{children}</main>
      {footer && <SiteFooter />}
    </SmoothScroll>
  )
}
