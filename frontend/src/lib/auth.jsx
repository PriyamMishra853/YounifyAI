import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { api } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null) // { user, workspace, role } | null
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setSession(await api.me())
    } catch {
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const value = useMemo(() => ({
    user: session?.user ?? null,
    workspace: session?.workspace ?? null,
    role: session?.role ?? null,
    loading,
    refresh,
    login: async (input) => { const s = await api.login(input); setSession(s); return s },
    signup: async (input) => { const s = await api.signup(input); setSession(s); return s },
    logout: async () => { await api.logout(); setSession(null) },
    can: (action) => {
      const role = session?.role
      if (action === 'edit') return role === 'owner' || role === 'editor'
      if (action === 'admin') return role === 'owner'
      return !!role
    },
  }), [session, loading, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

export function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="grid min-h-svh place-items-center bg-paper"><div className="skeleton h-3 w-40" /></div>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return children
}
