import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthError, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Módulos del schema (enum spira_module). 'inicio' no es módulo: es el home. */
export type ModuleKey = 'track' | 'pharma' | 'lab' | 'contable' | 'gerencia'

/** Nivel de acceso dentro de un módulo (enum module_role). Escalera estricta. */
export type ModuleRole = 'viewer' | 'operator' | 'leader' | 'admin'

/** Espejo de public.role_rank (migración 0009): viewer < operator < leader < admin. */
const roleRank: Record<ModuleRole, number> = { viewer: 1, operator: 2, leader: 3, admin: 4 }

interface Profile {
  id: string
  fullName: string
}

/** Traduce los errores de Supabase Auth a mensajes serenos en castellano (matchea por mensaje
    porque los códigos varían entre versiones). El default no expone detalles internos. */
function authErrorMessage(error: AuthError): string {
  const m = error.message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'No pudimos ingresar. Revisá el email y la contraseña.'
  if (m.includes('email not confirmed')) return 'Tu cuenta todavía no está confirmada. Revisá tu correo.'
  if (m.includes('rate limit') || m.includes('too many') || m.includes('after')) return 'Esperá unos minutos antes de volver a intentar.'
  if (m.includes('provider is not enabled') || m.includes('oauth')) return 'El ingreso con Google todavía no está disponible. Probá con tu email y contraseña.'
  if (m.includes('new password should be different')) return 'La contraseña nueva tiene que ser distinta a la anterior.'
  if (m.includes('password should be at least') || m.includes('weak')) return 'La contraseña es muy corta. Usá al menos 8 caracteres.'
  return 'Algo no salió bien. Probá de nuevo en un momento.'
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  /** Módulos a los que el usuario tiene acceso (de user_module_roles). */
  modules: ModuleKey[]
  /** Nivel del usuario en cada módulo (de user_module_roles). */
  roles: Partial<Record<ModuleKey, ModuleRole>>
  loading: boolean
  /** true cuando el usuario volvió desde el link de "olvidé mi contraseña" (evento
      PASSWORD_RECOVERY): hay una sesión de recuperación activa y hay que pedirle la clave nueva
      antes de dejarlo entrar (ver el Gate en App.tsx). */
  recovering: boolean
  /** Aviso para mostrar en el login (p. ej. el link de recuperación venció o es inválido).
      Se setea leyendo el error que Supabase devuelve en el hash de la URL. */
  authNotice: string | null
  /** Descarta el aviso del login (lo llaman las acciones del formulario al empezar). */
  clearAuthNotice: () => void
  /** ¿El usuario tiene en `module` un nivel >= `min`? Espejo de public.has_min_role. */
  hasMinRole: (module: ModuleKey, min: ModuleRole) => boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  /** Inicia OAuth con Google (provider habilitado en el dashboard de Supabase). Redirige fuera. */
  signInWithGoogle: () => Promise<{ error: string | null }>
  /** Manda el mail de "restablecer contraseña"; el link vuelve a la app (PASSWORD_RECOVERY). */
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>
  /** Fija una contraseña nueva (durante la recuperación). En éxito sale del modo recovering. */
  updatePassword: (password: string) => Promise<{ error: string | null }>
  /** Actualiza el nombre del perfil (public.users.full_name). La RLS de 0006 permite
      editar el perfil propio (id = auth.uid()); refresca el estado local al guardar. */
  updateProfile: (fullName: string) => Promise<{ error: string | null }>
  /** Cierra las OTRAS sesiones del usuario (mantiene la actual, scope 'others'). */
  signOutOthers: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [modules, setModules] = useState<ModuleKey[]>([])
  const [roles, setRoles] = useState<Partial<Record<ModuleKey, ModuleRole>>>({})
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)
  const [authNotice, setAuthNotice] = useState<string | null>(null)

  // sesión inicial + suscripción a cambios de auth
  useEffect(() => {
    // Si el link de recuperación venció o es inválido, Supabase nos devuelve con el error en el
    // hash de la URL (#error=...&error_code=otp_expired) y NO crea sesión. Lo leemos ANTES de que
    // el SDK limpie el hash y dejamos un aviso para el login, así el usuario no queda sin explicación.
    const hash = window.location.hash
    if (hash.includes('error')) {
      const params = new URLSearchParams(hash.replace(/^#/, ''))
      const code = params.get('error_code')
      if (params.get('error') || code) {
        setAuthNotice(
          code === 'otp_expired'
            ? 'El enlace para restablecer la contraseña venció. Pedí uno nuevo desde "Olvidé mi contraseña".'
            : 'El enlace no es válido o ya se usó. Pedí uno nuevo desde "Olvidé mi contraseña".',
        )
        // Limpiamos el hash para que el aviso no reaparezca al recargar.
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // El link de "olvidé mi contraseña" vuelve a la app y dispara PASSWORD_RECOVERY dejando una
      // sesión de recuperación activa. Marcamos el modo para que el Gate muestre "definí tu nueva
      // contraseña" en lugar de entrar al shell con esa sesión a medias (ver App.tsx).
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true)
        setAuthNotice(null) // arrancamos un flujo de recovery nuevo: limpiamos cualquier aviso viejo
      }
      // Si la sesión se cae (logout, o la sesión de recovery expira mientras se fija la clave),
      // salimos del modo recovering: si no, el Gate seguiría mostrando "Definí tu nueva contraseña"
      // sobre una sesión nula y el guardado fallaría con un mensaje genérico.
      if (!next) setRecovering(false)
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // al haber sesión, traer perfil (public.users) + roles (user_module_roles)
  useEffect(() => {
    if (!session) {
      setProfile(null)
      setModules([])
      setRoles({})
      return
    }
    const uid = session.user.id
    let active = true
    void (async () => {
      const [profRes, rolesRes] = await Promise.all([
        supabase.from('users').select('full_name').eq('id', uid).maybeSingle(),
        supabase.from('user_module_roles').select('module, role').eq('user_id', uid),
      ])
      if (!active) return
      const prof = profRes.data as { full_name: string } | null
      const rows = (rolesRes.data ?? []) as { module: ModuleKey; role: ModuleRole }[]
      setProfile({ id: uid, fullName: prof?.full_name ?? session.user.email ?? 'Usuario' })
      setModules(rows.map((r) => r.module))
      setRoles(Object.fromEntries(rows.map((r) => [r.module, r.role])))
    })()
    return () => {
      active = false
    }
  }, [session])

  const hasMinRole: AuthState['hasMinRole'] = (module, min) => {
    const r = roles[module]
    return r != null && roleRank[r] >= roleRank[min]
  }

  const signIn: AuthState['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? authErrorMessage(error) : null }
  }

  const signInWithGoogle: AuthState['signInWithGoogle'] = async () => {
    // redirectTo vuelve a la app; el cliente lee los tokens de la URL (detectSessionInUrl).
    // El botón sólo funciona cuando el proveedor Google esté configurado en el dashboard.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    return { error: error ? authErrorMessage(error) : null }
  }

  const requestPasswordReset: AuthState['requestPasswordReset'] = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    return { error: error ? authErrorMessage(error) : null }
  }

  const updatePassword: AuthState['updatePassword'] = async (password) => {
    const { error } = await supabase.auth.updateUser({ password })
    // Salió bien: dejamos el modo recuperación. La sesión de recovery sigue activa, así que el
    // Gate cae a session→AppShell y el usuario queda adentro sin volver a loguearse.
    if (!error) setRecovering(false)
    return { error: error ? authErrorMessage(error) : null }
  }

  const updateProfile: AuthState['updateProfile'] = async (fullName) => {
    const name = fullName.trim()
    if (!name) return { error: 'El nombre no puede quedar vacío.' }
    const uid = session?.user?.id
    if (!uid) return { error: 'Tu sesión expiró. Ingresá de nuevo.' }
    // Update directo (no RPC): la RLS de 0006 gatea `id = auth.uid()`. Pedimos las
    // filas afectadas para distinguir éxito de "0 filas = sin permiso" (RLS filtra en silencio).
    const { data, error } = await supabase.from('users').update({ full_name: name }).eq('id', uid).select('id')
    if (error) return { error: error.code === '42501' ? 'No tenés permiso para editar el perfil.' : 'No pudimos guardar el cambio. Probá de nuevo.' }
    if (!data || data.length === 0) return { error: 'No pudimos actualizar tu perfil.' }
    setProfile((p) => (p ? { ...p, fullName: name } : { id: uid, fullName: name }))
    return { error: null }
  }

  const signOutOthers: AuthState['signOutOthers'] = async () => {
    // scope 'others': revoca las demás sesiones y conserva la actual.
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    return { error: error ? authErrorMessage(error) : null }
  }

  const signOut: AuthState['signOut'] = async () => {
    setRecovering(false)
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session, profile, modules, roles, loading, recovering, hasMinRole,
        authNotice, clearAuthNotice: () => setAuthNotice(null),
        signIn, signInWithGoogle, requestPasswordReset, updatePassword, updateProfile, signOutOthers, signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
