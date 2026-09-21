import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { SYSTEM_TEMPLATES, showcaseDocuments } from '@younifyai/shared'
import { Logo } from '../components/Brand'
import DocPreview from '../components/DocPreview'
import { useAuth } from '../lib/auth'

function AuthShell({ title, subtitle, children, footer }) {
  const bill = showcaseDocuments().voice_bill
  return (
    <div className="grid min-h-svh bg-paper text-ink lg:grid-cols-[1fr_0.9fr]">
      <div className="flex flex-col px-5 py-6 md:px-12">
        <Logo tone="paper" />
        <div className="mx-auto flex w-full max-w-[26rem] flex-1 flex-col justify-center py-12">
          <h1 className="display text-[2.6rem]">{title}</h1>
          <p className="mt-3 text-slate">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-8 text-[0.95rem] text-slate">{footer}</p>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden bg-abyss p-12 lg:flex lg:flex-col lg:justify-between" aria-label="Example output">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(244,169,0,0.22),rgba(244,169,0)_65%)]" />
        <p className="eyebrow relative text-mist">One voice note in. This comes out.</p>
        <div className="relative mx-auto w-full max-w-md rotate-[-2deg] rounded-3xl bg-card p-7 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)]">
          <DocPreview template={SYSTEM_TEMPLATES.find((t) => t.id === 'voice_bill')} content={bill.content} compact />
        </div>
        <p className="relative max-w-sm text-[0.95rem] text-paper/70">
          Every document is a draft until you approve it. Edits, approvals and exports are logged.
        </p>
      </aside>
    </div>
  )
}

function Field({ label, error, id, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <input id={id} className="input h-11" aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} {...props} />
      {error && <p id={`${id}-err`} className="mt-1.5 text-[0.85rem] text-bad">{error}</p>}
    </div>
  )
}

function PasswordField({ error, id, label = 'Password', ...props }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} className="input h-11 pr-11" aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} {...props} />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-lg text-slate hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {error && <p id={`${id}-err`} className="mt-1.5 text-[0.85rem] text-bad">{error}</p>}
    </div>
  )
}

function useRedirectIfSignedIn(to) {
  const { user } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { if (user) navigate(to, { replace: true }) }, [user, to, navigate])
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')?.startsWith('/app') ? params.get('next') : '/app'
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  useRedirectIfSignedIn(next)
  useEffect(() => { document.title = 'Sign in · YounifyAI' }, [])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(form)
      navigate(next, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your workspace."
      footer={<>New here? <Link to="/signup" className="font-semibold text-ink underline-offset-4 hover:underline">Create an account</Link></>}
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-[0.9rem] text-bad">{error.message}</p>}
        <Field id="email" label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <PasswordField id="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button type="submit" disabled={busy} className="btn btn-ink h-12 w-full text-base">
          {busy ? 'Signing in…' : <>Sign in <ArrowRight size={18} aria-hidden="true" /></>}
        </button>
      </form>
    </AuthShell>
  )
}

export function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  useRedirectIfSignedIn('/app?welcome=1')
  useEffect(() => { document.title = 'Create account · YounifyAI' }, [])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signup(form)
      navigate('/app?welcome=1', { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }
  const f = error?.fields || {}

  return (
    <AuthShell
      title="Start capturing"
      subtitle="Free plan: five documents a day. No card needed."
      footer={<>Already have an account? <Link to="/login" className="font-semibold text-ink underline-offset-4 hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && !error.fields && <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-[0.9rem] text-bad">{error.message}</p>}
        <Field id="name" label="Your name" autoComplete="name" required value={form.name} error={f.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Field id="email" label="Email" type="email" autoComplete="email" required value={form.email} error={f.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <PasswordField id="password" autoComplete="new-password" required minLength={8} value={form.password} error={f.password} placeholder="At least 8 characters" onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button type="submit" disabled={busy} className="btn btn-amber h-12 w-full text-base">
          {busy ? 'Creating your workspace…' : <>Create account <ArrowRight size={18} aria-hidden="true" /></>}
        </button>
      </form>
    </AuthShell>
  )
}
