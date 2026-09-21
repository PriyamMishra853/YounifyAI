import { useEffect, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Lock, Trash2, UserPlus } from 'lucide-react'
import { ROLES } from '@younifyai/shared'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ConfirmDialog, PageHeader, Spinner, Tabs, UsageMeter } from '../../components/ui'
import PricingPlans from '../../components/PricingPlans'

function Profile() {
  const { user, workspace, can, refresh } = useAuth()
  const [name, setName] = useState(user.name)
  const [wsName, setWsName] = useState(workspace.name)
  const [busy, setBusy] = useState(null)

  const saveProfile = async (e) => {
    e.preventDefault()
    setBusy('profile')
    try { await api.updateProfile({ name }); await refresh(); toast.success('Profile saved.') } catch (err) { toast.error(err.message) }
    setBusy(null)
  }
  const saveWorkspace = async (e) => {
    e.preventDefault()
    setBusy('ws')
    try { await api.updateWorkspace({ name: wsName }); await refresh(); toast.success('Workspace renamed.') } catch (err) { toast.error(err.message) }
    setBusy(null)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={saveProfile} className="card space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold tracking-tight">Your profile</h2>
        <div>
          <label htmlFor="p-name" className="field-label">Name</label>
          <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="p-email" className="field-label">Email</label>
          <input id="p-email" className="input bg-paper" value={user.email} readOnly />
        </div>
        <button type="submit" className="btn btn-ink btn-sm" disabled={busy === 'profile' || name === user.name}>{busy === 'profile' && <Spinner size={14} />}Save profile</button>
      </form>
      <form onSubmit={saveWorkspace} className="card space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold tracking-tight">Workspace</h2>
        <div>
          <label htmlFor="w-name" className="field-label">Workspace name</label>
          <input id="w-name" className="input" value={wsName} onChange={(e) => setWsName(e.target.value)} disabled={!can('admin')} />
        </div>
        {can('admin') ? (
          <button type="submit" className="btn btn-ink btn-sm" disabled={busy === 'ws' || wsName === workspace.name}>{busy === 'ws' && <Spinner size={14} />}Rename workspace</button>
        ) : (
          <p className="text-[0.85rem] text-slate">Only owners can rename the workspace.</p>
        )}
      </form>
    </div>
  )
}

function Plan() {
  const { workspace, can, refresh } = useAuth()
  const { usage, refreshUsage } = useOutletContext()
  const [busy, setBusy] = useState(false)
  const choose = async (planId) => {
    setBusy(true)
    try {
      await api.changePlan(planId)
      await refresh()
      refreshUsage()
      toast.success(`You are on the ${planId[0].toUpperCase()}${planId.slice(1)} plan.`)
    } catch (e) {
      toast.error(e.message)
    }
    setBusy(false)
  }
  return (
    <div className="space-y-6">
      <div className="card grid gap-6 p-6 md:grid-cols-[1fr_1.2fr] md:items-center">
        <div>
          <p className="eyebrow text-slate">Current plan</p>
          <p className="mt-2 font-display text-3xl font-bold capitalize tracking-tight">{workspace.plan}</p>
        </div>
        <UsageMeter usage={usage} />
      </div>
      <p className="rounded-xl bg-amber/15 px-4 py-3 text-[0.88rem]">
        Payments are not connected in this MVP. Switching plans takes effect immediately so you can try every feature.
      </p>
      {can('admin') ? <PricingPlans current={workspace.plan} onChoose={choose} busy={busy} /> : <p className="text-slate">Only owners can change the plan.</p>}
    </div>
  )
}

function Members() {
  const { workspace, user, can } = useAuth()
  const [members, setMembers] = useState(null)
  const [form, setForm] = useState({ email: '', role: 'editor' })
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(null)
  const load = () => api.listMembers().then(setMembers).catch((e) => toast.error(e.message))
  useEffect(() => { load() }, [])
  const pro = workspace.plan === 'pro'
  const admin = can('admin')

  const invite = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.inviteMember(form); toast.success(`Invited ${form.email}.`); setForm({ email: '', role: 'editor' }); load() } catch (err) { toast.error(err.message) }
    setBusy(false)
  }
  const changeRole = async (m, role) => {
    try { await api.updateMemberRole(m.id, role); toast.success(`${m.name} is now ${ROLES[role].label.toLowerCase()}.`); load() } catch (err) { toast.error(err.message) }
  }

  return (
    <div className="space-y-6">
      {!pro && (
        <div className="card flex flex-col items-start gap-4 p-6 md:flex-row md:items-center">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink text-amber"><Lock size={20} aria-hidden="true" /></span>
          <div className="flex-1">
            <p className="font-semibold">Workspace members are part of Pro.</p>
            <p className="text-[0.92rem] text-slate">Invite editors to capture and approve, and viewers who only read and export.</p>
          </div>
          {admin && <Link to="/app/settings?tab=plan" className="btn btn-amber btn-sm">See plans</Link>}
        </div>
      )}
      <div className="card overflow-hidden">
        <table className="w-full text-left text-[0.92rem]">
          <thead className="border-b border-fog bg-paper/60">
            <tr className="text-[0.72rem] uppercase tracking-[0.06em] text-slate">
              <th scope="col" className="mono px-5 py-3 font-medium">Person</th>
              <th scope="col" className="mono px-5 py-3 font-medium">Role</th>
              <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-fog">
            {!members && <tr><td colSpan={3} className="p-5"><div className="skeleton h-8" /></td></tr>}
            {members?.map((m) => (
              <tr key={m.id}>
                <td className="px-5 py-3.5">
                  <p className="font-semibold">{m.name}{m.userId === user.id && <span className="ml-2 text-[0.8rem] font-normal text-slate">(you)</span>}</p>
                  <p className="text-[0.8rem] text-slate">{m.email}{m.status === 'invited' && ' · invite pending'}</p>
                </td>
                <td className="px-5 py-3.5">
                  {admin && m.userId !== user.id ? (
                    <select className="input h-9 w-auto" value={m.role} onChange={(e) => changeRole(m, e.target.value)} aria-label={`Role for ${m.name}`}>
                      {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
                    </select>
                  ) : (
                    <span className="chip bg-paper-2 text-ink">{ROLES[m.role].label}</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-right">
                  {admin && m.userId !== user.id && (
                    <button type="button" onClick={() => setRemoving(m)} className="grid h-8 w-8 place-items-center rounded-lg text-slate hover:bg-paper hover:text-bad" aria-label={`Remove ${m.name}`}><Trash2 size={16} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {admin && pro && (
        <form onSubmit={invite} className="card grid gap-3 p-5 md:grid-cols-[1fr_10rem_auto] md:items-end">
          <div>
            <label htmlFor="inv-email" className="field-label">Invite by email</label>
            <input id="inv-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="colleague@company.com" />
          </div>
          <div>
            <label htmlFor="inv-role" className="field-label">Role</label>
            <select id="inv-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-ink" disabled={busy || !form.email}>{busy ? <Spinner size={14} /> : <UserPlus size={16} aria-hidden="true" />}Send invite</button>
        </form>
      )}
      <dl className="grid gap-4 sm:grid-cols-3">
        {Object.entries(ROLES).map(([k, r]) => (
          <div key={k} className="rounded-xl bg-paper-2 p-4">
            <dt className="font-semibold">{r.label}</dt>
            <dd className="mt-1 text-[0.85rem] text-slate">{r.can}</dd>
          </div>
        ))}
      </dl>
      <ConfirmDialog
        open={!!removing}
        title={`Remove ${removing?.name}?`}
        body="They lose access to this workspace immediately. Documents they made stay."
        confirmLabel="Remove"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          try { await api.removeMember(removing.id); toast.success('Removed.'); load() } catch (e) { toast.error(e.message) }
          setRemoving(null)
        }}
      />
    </div>
  )
}

export default function Settings() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'profile'
  useEffect(() => { document.title = 'Settings · YounifyAI' }, [])
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Workspace settings" />
      <div className="mt-8">
        <Tabs label="Settings sections" value={tab} onChange={(v) => setParams({ tab: v })} tabs={[{ value: 'profile', label: 'Profile' }, { value: 'plan', label: 'Plan and usage' }, { value: 'members', label: 'Members' }]} />
      </div>
      <div className="mt-8">
        {tab === 'profile' && <Profile />}
        {tab === 'plan' && <Plan />}
        {tab === 'members' && <Members />}
      </div>
    </div>
  )
}
