import { Link } from 'react-router'
import { Logo } from './Brand'

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/8 bg-abyss text-mist">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-10">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-[0.95rem] leading-relaxed">
            Capture anything. Document everything. A multimodal documentation engine built for CSJMU Ideathon 2026.
          </p>
        </div>
        <FooterCol title="Product" links={[['How it works', '/#pipeline'], ['Use cases', '/#use-cases'], ['Pricing', '/pricing']]} />
        <FooterCol title="Workspace" links={[['Sign in', '/login'], ['Create account', '/signup'], ['New capture', '/app/capture']]} />
        <div>
          <p className="eyebrow text-paper/60">Team UnfilteredEngineers</p>
          <ul className="mt-4 space-y-2 text-[0.95rem]">
            <li>Priyam Mishra</li>
            <li>Ashish Kumar</li>
            <li>Ayush Srivastav</li>
          </ul>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 border-t border-white/8 px-5 py-6 text-[0.8rem] md:flex-row md:justify-between md:px-10">
        <span>© 2026 YounifyAI</span>
        <span className="mono text-[0.7rem]">IDEATHON 2026 · VISION TO VENTURE</span>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }) {
  return (
    <div>
      <p className="eyebrow text-paper/60">{title}</p>
      <ul className="mt-4 space-y-2 text-[0.95rem]">
        {links.map(([label, to]) => (
          <li key={label}>
            <Link to={to} className="transition-colors hover:text-paper">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
