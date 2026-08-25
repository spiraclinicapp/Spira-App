import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthError, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { meetsMinRole } from './roles'
import type { ModuleKey, ModuleRole } from './roles'

/* El vocabulario del acceso (los tipos y la escalera de niveles) vive en `lib/roles.ts`: es puro y
   por lo tanto testeable, y estaba duplicado a mano en dos archivos. Se reexporta desde acá porque
   media app lo importa de `lib/auth` desde antes de la mudanza. */
export type { ModuleKey, ModuleRole } from './roles'

interface Profile {
  id: string
  fullName: string
  /** Puesto/título (cosmético, NO es acceso; columna de 0045). null si no está seteado. */
  puesto: string | null
  /** Centro asociado, forzado y de solo lectura (columna de 0045). */
  centro: string | null
  /** Timestamps de los últimos cambios (regla 1/30 días; columnas de 0045). ISO o null. */
  nameChangedAt: string | null
  emailChangedAt: string | null
}

/** Los RPC de perfil (0045) lanzan mensajes claros en castellano vía `raise exception`;
    los dejamos pasar tal cual. Ante un error inesperado, un texto genérico. */
function rpcErrorMessage(error: { message?: string }, fallback: string): string {
  const m = (error.message ?? '').trim()
  return m || fallback
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
  /** `loading` es "¿sabemos si hay sesión?"; esto es "¿sabemos qué puede ver ESTE usuario?" — dos
      preguntas distintas. DERIVADO (no un flag propio): compara el id de sesión actual contra el id
      para el que ya resolvimos `modules`/`roles`. Así un TOKEN_REFRESHED o el SIGNED_IN que auth-js
      dispara al recuperar el foco de la pestaña —mismo usuario, objeto de sesión nuevo— no vuelven a
      poner esto en true, y el shell no se desmonta de la nada. El shell (Gate en App.tsx) espera
      `loading` Y esto antes de montar: si sólo esperara `loading`, el guard de acceso evaluaría
      isAllowed() contra modules=[] todavía sin llenar y rechazaría a un usuario legítimo. */
  modulesLoading: boolean
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
  /** Cambia el nombre del perfil (RPC update_my_name de 0045: regla 1/30 días server-side). */
  updateProfile: (fullName: string) => Promise<{ error: string | null }>
  /** Cambia el puesto/título (RPC update_my_puesto de 0045; cosmético, NO toca el acceso). */
  updatePuesto: (puesto: string | null) => Promise<{ error: string | null }>
  /** Pide cambiar el correo: gatea la regla 1/30 días (RPC) y dispara el cambio en Auth,
      que manda un link de confirmación al correo nuevo. `pending` = link enviado. */
  requestEmailChange: (email: string) => Promise<{ error: string | null; pending: boolean }>
  /** Cierra las OTRAS sesiones del usuario (mantiene la actual, scope 'others'). */
  signOutOthers: () => Promise<{ error: string | null }>
  /** Cierra la sesión actual. Devuelve el mensaje de error (o `null` si salió bien): `auth-js` NO
      borra la sesión local si la llamada a la API falla por red, así que si el error se descartara
      la pantalla igual cambiaría a Inicio (ver `UserMenu`) mientras la sesión sigue viva — en una
      máquina compartida de clínica eso es peor que no mover nada, porque el usuario se va creyendo
      que cerró sesión. */
  signOut: () => Promise<string | null>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [modules, setModules] = useState<ModuleKey[]>([])
  const [roles, setRoles] = useState<Partial<Record<ModuleKey, ModuleRole>>>({})
  const [loading, setLoading] = useState(true)
  const [modulesUserId, setModulesUserId] = useState<string | null>(null)
  /* `modulesLoading` DERIVADO y no un flag: la pregunta es si los roles que tenemos en la mano son
     de ESTE usuario. Un TOKEN_REFRESHED, o el SIGNED_IN que auth-js emite cada vez que la pestaña
     recupera el foco, traen un objeto de sesión NUEVO del MISMO usuario — con un flag, ahí el Gate
     desmontaba el shell entero y se llevaba puesto todo lo que no vive en la URL (un wizard a medio
     llenar, un formulario de alta). Derivado, esa transición no cambia nada. */
  const modulesLoading = session != null && modulesUserId !== session.user.id
  const [recovering, setRecovering] = useState(false)
  const [authNotice, setAuthNotice] = useState<string | null>(null)

  // sesión inicial + suscripción a cambios de auth
  useEffect(() => {
    // Al volver de un flujo externo (link de recuperación de contraseña, u OAuth de Google),
    // Supabase puede devolvernos un error en la URL —en el hash (#...) o en el query (?...)—
    // SIN crear sesión. Lo leemos ANTES de que el SDK limpie la URL y dejamos un aviso para el
    // login, así el usuario no queda sin explicación.
    const errParams = (() => {
      const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      if (fromHash.get('error') || fromHash.get('error_code')) return fromHash
      const fromSearch = new URLSearchParams(window.location.search)
      if (fromSearch.get('error') || fromSearch.get('error_code')) return fromSearch
      return null
    })()
    if (errParams) {
      const code = errParams.get('error_code') ?? ''
      const desc = (errParams.get('error_description') ?? '').toLowerCase()
      // Supabase rechaza el OAuth cuando el auto-registro está apagado y el email no tiene cuenta.
      // El código/mensaje exacto varía entre versiones, así que matcheamos tolerante (por substring).
      const isSignupDisabled =
        code === 'signup_disabled' ||
        (desc.includes('signup') && (desc.includes('disabled') || desc.includes('not allowed')))
      setAuthNotice(
        isSignupDisabled
          ? 'No encontramos una cuenta con ese correo. Si necesitás acceso, pedíselo al administrador de Spira.'
          : code === 'otp_expired'
            ? 'El enlace para restablecer la contraseña venció. Pedí uno nuevo desde "Olvidé mi contraseña".'
            : 'El enlace no es válido o ya se usó. Pedí uno nuevo desde "Olvidé mi contraseña".',
      )
      // Limpiamos el hash y SOLO los parámetros de Supabase: desde que la navegación vive en la URL
      // (ver src/lib/router.ts), el query lleva el estado de la pantalla —el día, los filtros, la
      // entidad abierta— y borrarlo entero se lo llevaba puesto. Un error de auth no tiene por qué
      // devolverte a la pantalla sin filtrar.
      const limpio = new URLSearchParams(window.location.search)
      for (const p of ['error', 'error_code', 'error_description']) limpio.delete(p)
      const qs = limpio.toString()
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
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
      // Sin sesión no hay roles que traer: no hay nada que esperar, así que modulesLoading (derivado)
      // baja sola porque `session` es null — acá solo limpiamos el resto del estado.
      setProfile(null)
      setModules([])
      setRoles({})
      setModulesUserId(null)
      return
    }
    const uid = session.user.id
    let active = true
    type ProfRow = { full_name: string; puesto: string | null; centro: string | null; name_changed_at: string | null; email_changed_at: string | null }
    void (async () => {
      try {
        // Perfil + roles en paralelo. El perfil pide las columnas de 0045; si la migración
        // todavía no se aplicó (columnas inexistentes), caemos a full_name para no romper
        // la carga de la app (los campos nuevos quedan null hasta aplicar 0045).
        const [ext, rolesRes] = await Promise.all([
          supabase.from('users').select('full_name, puesto, centro, name_changed_at, email_changed_at').eq('id', uid).maybeSingle(),
          supabase.from('user_module_roles').select('module, role').eq('user_id', uid),
        ])
        let prof = ext.data as ProfRow | null
        if (ext.error) {
          const basic = await supabase.from('users').select('full_name').eq('id', uid).maybeSingle()
          const b = basic.data as { full_name: string } | null
          prof = b ? { full_name: b.full_name, puesto: null, centro: null, name_changed_at: null, email_changed_at: null } : null
        }
        if (!active) return
        const rows = (rolesRes.data ?? []) as { module: ModuleKey; role: ModuleRole }[]
        setProfile({
          id: uid,
          fullName: prof?.full_name ?? session.user.email ?? 'Usuario',
          puesto: prof?.puesto ?? null,
          centro: prof?.centro ?? null,
          nameChangedAt: prof?.name_changed_at ?? null,
          emailChangedAt: prof?.email_changed_at ?? null,
        })
        setModules(rows.map((r) => r.module))
        setRoles(Object.fromEntries(rows.map((r) => [r.module, r.role])))
      } finally {
        // Crítico: tiene que correr TAMBIÉN si las consultas de arriba tiran error — si
        // modulesUserId no se fijara ante una falla, `modulesLoading` (derivado) se cuelga en true
        // para siempre y el Gate no sale del splash. `active` respeta la cancelación: si el efecto
        // ya se limpió (la sesión cambió de nuevo mientras esta llamada estaba en vuelo), no
        // pisamos el estado de un montaje viejo sobre el del montaje nuevo.
        // "ya preguntamos por este usuario, con respuesta o sin ella" — con error, roles/modules
        // quedan en lo que tenían (o vacíos si es la primera carga), pero la pregunta ya no cuelga.
        if (active) setModulesUserId(uid)
      }
    })()
    return () => {
      active = false
    }
  }, [session])

  const hasMinRole: AuthState['hasMinRole'] = (module, min) => meetsMinRole(roles[module], min)

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
    // Vía RPC (0045): la regla de 1 cambio/30 días se valida server-side (no se puede saltear).
    const { error } = await supabase.rpc('update_my_name', { p_name: name })
    if (error) return { error: rpcErrorMessage(error, 'No pudimos guardar el nombre.') }
    setProfile((p) => (p ? { ...p, fullName: name, nameChangedAt: new Date().toISOString() } : p))
    return { error: null }
  }

  const updatePuesto: AuthState['updatePuesto'] = async (puesto) => {
    const { error } = await supabase.rpc('update_my_puesto', { p_puesto: puesto })
    if (error) return { error: rpcErrorMessage(error, 'No pudimos guardar el puesto.') }
    setProfile((p) => (p ? { ...p, puesto } : p))
    return { error: null }
  }

  const requestEmailChange: AuthState['requestEmailChange'] = async (email) => {
    const next = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) return { error: 'Ingresá un correo válido.', pending: false }

    /* La regla de 30 días se PREGUNTA antes y se SELLA después, en dos llamadas distintas.
       Antes esto era una sola: se disparaba el cambio y después `stamp_email_change()` —cuyo error
       se DESCARTABA—. El motivo era bueno (no "quemar" la ventana si el correo era inválido o ya
       estaba en uso) pero el efecto era que la regla no se aplicaba nunca: el `raise` del servidor
       se perdía y lo único que frenaba era el `disabled` del input, o sea nada para quien abra la
       consola del navegador. Preguntando primero con una función que NO sella, se conserva el
       motivo original y la regla vuelve a existir. */
    const { data: desbloqueo, error: guardError } = await supabase.rpc('email_change_locked_until')
    if (guardError) return { error: rpcErrorMessage(guardError, 'No pudimos verificar el cambio de correo.'), pending: false }
    if (desbloqueo) {
      const cuando = new Date(desbloqueo as string).toLocaleDateString('es-AR')
      return { error: `Podés cambiar el correo una vez cada 30 días. Vas a poder de nuevo el ${cuando}.`, pending: false }
    }

    const { error } = await supabase.auth.updateUser({ email: next })
    if (error) return { error: authErrorMessage(error), pending: false }

    /* El sello ya no se descarta, pero tampoco puede volverse un error para el usuario: para cuando
       corre, el mail de confirmación YA salió. Si falla (una carrera con otra pestaña es el único
       camino, porque el guard de arriba acaba de decir que se podía), el cambio sigue siendo real y
       lo único que queda sin registrar es la fecha — o sea, la ventana no se consume. Decirle
       "error" a alguien cuyo correo sí está cambiando sería la peor de las dos mentiras posibles. */
    const { error: stampError } = await supabase.rpc('stamp_email_change')
    if (!stampError) setProfile((p) => (p ? { ...p, emailChangedAt: new Date().toISOString() } : p))
    return { error: null, pending: true }
  }

  const signOutOthers: AuthState['signOutOthers'] = async () => {
    // scope 'others': revoca las demás sesiones y conserva la actual.
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    return { error: error ? authErrorMessage(error) : null }
  }

  const signOut: AuthState['signOut'] = async () => {
    setRecovering(false)
    const { error } = await supabase.auth.signOut()
    return error ? authErrorMessage(error) : null
  }

  return (
    <AuthContext.Provider
      value={{
        session, profile, modules, roles, loading, modulesLoading, recovering, hasMinRole,
        authNotice, clearAuthNotice: () => setAuthNotice(null),
        signIn, signInWithGoogle, requestPasswordReset, updatePassword, updateProfile, updatePuesto, requestEmailChange, signOutOthers, signOut,
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
