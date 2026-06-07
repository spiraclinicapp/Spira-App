import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Módulos del schema (enum spira_module). 'inicio' no es módulo: es el home. */
export type ModuleKey = 'track' | 'pharma' | 'lab' | 'contable' | 'gerencia'

interface Profile {
  id: string
  fullName: string
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  /** Módulos a los que el usuario tiene acceso (de user_module_roles). */
  modules: ModuleKey[]
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [modules, setModules] = useState<ModuleKey[]>([])
  const [loading, setLoading] = useState(true)

  // sesión inicial + suscripción a cambios de auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // al haber sesión, traer perfil (public.users) + roles (user_module_roles)
  useEffect(() => {
    if (!session) {
      setProfile(null)
      setModules([])
      return
    }
    const uid = session.user.id
    let active = true
    void (async () => {
      const [profRes, rolesRes] = await Promise.all([
        supabase.from('users').select('full_name').eq('id', uid).maybeSingle(),
        supabase.from('user_module_roles').select('module').eq('user_id', uid),
      ])
      if (!active) return
      const prof = profRes.data as { full_name: string } | null
      const rows = (rolesRes.data ?? []) as { module: ModuleKey }[]
      setProfile({ id: uid, fullName: prof?.full_name ?? session.user.email ?? 'Usuario' })
      setModules(rows.map((r) => r.module))
    })()
    return () => {
      active = false
    }
  }, [session])

  const signIn: AuthState['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  const signOut: AuthState['signOut'] = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, modules, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
