import { Link } from 'react-router'
import { Logo } from '../components/Brand'

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col bg-abyss px-5 py-6 text-paper md:px-10">
      <Logo />
      <div className="mx-auto flex max-w-xl flex-1 flex-col justify-center">
        <p className="eyebrow text-amber">404 · nothing captured here</p>
        <h1 className="display mt-4 text-[clamp(2.6rem,6vw,4.5rem)]">This page doesn’t exist.</h1>
        <p className="mt-4 text-paper/70">The link may be old, or the document was deleted.</p>
        <div className="mt-8 flex gap-3">
          <Link to="/" className="btn btn-amber">Go to the home page</Link>
          <Link to="/app" className="btn btn-ghost-dark">Open your workspace</Link>
        </div>
      </div>
    </div>
  )
}
