import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { BookOpen, FileText, LayoutGrid, LogOut, Menu as MenuIcon, Plus, Settings, Shapes, X } from 'lucide-react'
import { Logo } from '../../components/Brand'
import { UsageMeter } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { api, API_MODE } from '../../lib/api'

const NAV = [
  { to: '/app', label: 'Today', icon: LayoutGrid, end: true },
  { to: '/app/documents', label: 'Documents', icon: FileText },
  { to: '/app/templates', label: 'Templates', icon: Shapes },
  { to: '/app/knowledge', label: 'Knowledge', icon: BookOpen },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

/** Shown only to people who belong to more than one workspace. */
function WorkspaceSwitcher() {
  const { workspace, refresh } = useAuth()
  const navigate = useNavigate()
  const [list, setList] = useState([])
  useEffect(() => { api.listWorkspaces?.().then(setList).catch(() => {}) }, [workspace?.id])
  if (list.length < 2) return null
  return (
    <label className="mt-5 block px-2">
      <span className="eyebrow text-mist/70">Workspace</span>
      <select
        value={workspace?.id}
        onChange={async (e) => {
          try {
            await api.switchWorkspace(e.target.value)
            await refresh()
            navigate('/app')
          } catch (err) {
            toast.error(err.message)
          }
        }}
        className="mt-1.5 w-full rounded-lg border border-white/10 bg-navy px-2.5 py-2 text-[0.88rem] text-paper"
      >
        {list.map((w) => <option key={w.id} value={w.id}>{w.name} · {w.role}</option>)}
      </select>
    </label>
  )
}

function Sidebar({ usage, onNavigate }) {
  const { user, workspace, role, logout, can } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="flex h-full flex-col bg-abyss px-4 py-5 text-paper">
      <div className="px-2"><Logo to="/app" /></div>
      <WorkspaceSwitcher />
      {can('edit') && (
        <Link to="/app/capture" onClick={onNavigate} className="btn btn-amber mt-7 w-full">
          <Plus size={18} aria-hidden="true" /> New capture
        </Link>
      )}
      <nav className="mt-6 flex-1" aria-label="Workspace">
        <ul className="space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.93rem] font-medium transition-colors ${isActive ? 'bg-white/10 text-paper' : 'text-mist hover:bg-white/5 hover:text-paper'}`}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="rounded-2xl border border-white/8 bg-navy/60 p-4">
        <UsageMeter usage={usage} tone="dark" />
        {usage && usage.plan !== 'pro' && can('admin') && (
          <Link to="/app/settings?tab=plan" onClick={onNavigate} className="mt-3 block text-[0.8rem] font-semibold text-amber hover:underline">Upgrade plan</Link>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3 px-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-2 font-display text-sm font-bold text-amber">
          {user?.name?.[0]?.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.88rem] font-semibold">{user?.name}</p>
          <p className="truncate text-[0.72rem] text-mist">{workspace?.name} · {role}</p>
        </div>
        <button
          type="button"
          onClick={async () => { await logout(); navigate('/') }}
          className="grid h-9 w-9 place-items-center rounded-lg text-mist hover:bg-white/8 hover:text-paper"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={17} />
        </button>
      </div>
    </div>
  )
}

export default function AppLayout() {
  const [usage, setUsage] = useState(null)
  const [drawer, setDrawer] = useState(false)
  const { pathname } = useLocation()

  const refreshUsage = useCallback(() => { api.getUsage().then(setUsage).catch(() => {}) }, [])
  useEffect(() => { refreshUsage() }, [refreshUsage, pathname])
  useEffect(() => setDrawer(false), [pathname])

  return (
    <div className="min-h-svh bg-paper text-ink">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <Sidebar usage={usage} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-fog bg-paper/90 px-4 backdrop-blur lg:hidden">
        <Logo to="/app" tone="paper" />
        <button type="button" onClick={() => setDrawer(true)} className="grid h-10 w-10 place-items-center rounded-lg" aria-label="Open menu" aria-expanded={drawer}>
          <MenuIcon size={22} />
        </button>
      </header>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-ink/50" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <div className="animate-rise absolute inset-y-0 left-0 w-72">
            <Sidebar usage={usage} onNavigate={() => setDrawer(false)} />
            <button type="button" onClick={() => setDrawer(false)} className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-lg text-paper" aria-label="Close menu"><X size={20} /></button>
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        {API_MODE === 'mock' && (
          <p className="border-b border-amber/30 bg-amber/12 px-5 py-2 text-center text-[0.8rem] text-amber-ink">
            Preview mode: data stays in this browser and documents are structured offline. Start the API server for real processing.
          </p>
        )}
        <main className="mx-auto max-w-[1180px] px-4 py-8 md:px-8 md:py-10">
          <Outlet context={{ usage, refreshUsage }} />
        </main>
      </div>
    </div>
  )
}
