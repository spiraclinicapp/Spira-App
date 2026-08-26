import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { supabase } from '../lib/supabase'
import type { Accesos, AccessAuditRow, ModuleKey, ModuleRole } from '../lib/roles'
import type { PostgrestError } from '@supabase/supabase-js'

/* ============================================================================
   Equipo y accesos — la capa de datos de la consola de gerencia.

   Lee de dos vistas y escribe por un RPC (migración 0096). Las tres cosas están cerradas a gerencia
   por la RLS, no por esta capa: `v_team_access` va con security_invoker y hereda la policy de
   `public.users`, y `v_access_audit` la de `audit_log`. Acá no hay ninguna decisión de permisos —
   si la hubiera, sería la que se puede saltear.
   ========================================================================== */

/** Fila de `v_team_access` (0096). Tipos a mano, como el resto de `data/`. */
export interface TeamMemberRow {
  id: string
  full_name: string
  /** Copiado de auth.users por la 0095. Puede faltar si la cuenta nunca entró desde entonces. */
  email: string | null
  /** Puesto cosmético (0045). NO es acceso. */
  puesto: string | null
  centro: string | null
  is_active: boolean
  created_at: string
  /** {modulo: nivel}, ya agrupado por la vista. */
  accesos: Accesos
}

/**
 * Traduce los errores de LECTURA. Hace falta de verdad: `useSupabaseQuery` sin esto muestra
 * `err.message` crudo, que llega en inglés nombrando objetos del schema — el caso real fue
 * "Could not find the table public.v_team_access in the schema cache" en la cara de la usuaria
 * cuando faltaba aplicar una migración.
 */
function teamReadErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  // PGRST202/205: la función o la tabla no existen en el schema cache → falta aplicar la migración.
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01') {
    return 'Falta aplicar una actualización del sistema para ver el equipo. Avisale al administrador.'
  }
  if (code === '42501') return 'No tenés permiso para ver el equipo del centro.'
  return 'No pudimos traer el equipo. Probá de nuevo en un momento.'
}

/**
 * El equipo del centro con sus accesos.
 *
 * ⚠️ CERO FILAS NO ES UN ERROR, PERO TAMPOCO ES "no hay nadie". La RLS filtra EN SILENCIO: quien no
 * tiene gerencia recibe únicamente su propia fila, sin ningún aviso. Por eso la vista NO decide
 * "está vacío, mostremos el estado vacío" — quien llama tiene que preguntarse antes si esta persona
 * es gerencia (mirando `roles.gerencia` de `useAuth`), y mostrar "Tu acceso" en vez de una lista
 * vacía que parecería un error del sistema. Ver `EquipoYAccesosSection`.
 */
export function useTeamAccess(): QueryResult<TeamMemberRow[]> {
  return useSupabaseQuery<TeamMemberRow[]>(
    (c) =>
      c
        .from('v_team_access')
        .select('id, full_name, email, puesto, centro, is_active, created_at, accesos')
        .order('full_name', { ascending: true })
        .returns<TeamMemberRow[]>(),
    [],
    teamReadErrorMessage,
  )
}

/**
 * El historial de cambios de acceso de UNA persona (E2), del más nuevo al más viejo.
 *
 * Limitado a 20: `audit_log` es transversal y crece sin techo, y en la ficha de una persona lo que
 * importa es lo último que pasó — no un scroll infinito de dos años. Si algún día hace falta el
 * historial completo, es una pantalla propia, no esta lista.
 *
 * Un error acá NO es crítico: la consola sigue siendo usable sin el historial, así que quien llama
 * puede tratarlo como "no hay nada que mostrar" en vez de romper la pantalla entera.
 */
export function useAccessAudit(userId: string | null): QueryResult<AccessAuditRow[]> {
  return useSupabaseQuery<AccessAuditRow[]>(
    (c) =>
      c
        .from('v_access_audit')
        .select('id, occurred_at, action, module, role_before, role_after, actor_name, target_name')
        // El filtro por persona va sobre la columna que la vista ya derivó del payload.
        .eq('target_user_id', userId ?? '00000000-0000-0000-0000-000000000000')
        .order('occurred_at', { ascending: false })
        .limit(20)
        .returns<AccessAuditRow[]>(),
    [userId],
    teamReadErrorMessage,
  )
}

/**
 * Traduce los errores de ESCRITURA del RPC.
 *
 * Los mensajes de los guards de `set_module_access` (0096) ya vienen redactados en castellano desde
 * el servidor —"No podés quitarte a vos mismo la administración"— así que se dejan pasar tal cual;
 * es el mismo criterio que usan los RPC de perfil de la 0045. Sólo se traducen los códigos crudos
 * de Postgres, que llegarían en inglés.
 */
function accessErrorMessage(e: PostgrestError): string {
  const code = e.code ?? ''
  if (code === 'PGRST202' || code === '42883') {
    return 'Falta aplicar una actualización del sistema para cambiar accesos.'
  }
  if (code === '42501') return 'No tenés permiso para cambiar accesos.'
  const m = (e.message ?? '').trim()
  return m || 'No pudimos guardar el cambio. Probá de nuevo en un momento.'
}

export interface SetAccessInput {
  userId: string
  module: ModuleKey
  /** `null` = revocar el acceso a ese módulo. */
  role: ModuleRole | null
  /** Lo que el navegador creía vigente. `null` = "no tenía acceso". SIEMPRE se manda: es el
   *  compare-and-swap que evita que dos administradoras editando a la vez se pisen en silencio. */
  expectedRole: ModuleRole | null
}

/** Da, cambia o revoca el acceso de una persona a un módulo. Todas las reglas viven en el RPC. */
export async function setModuleAccess(input: SetAccessInput): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_module_access', {
    p_user_id: input.userId,
    p_module: input.module,
    p_role: input.role,
    p_expected_role: input.expectedRole,
  })
  return { error: error ? accessErrorMessage(error) : null }
}

/* ============================================================================
   Alta, restablecimiento y baja de cuentas (docs/plan-alta-de-cuentas.md, PR-2).

   El trabajo está REPARTIDO A PROPÓSITO entre dos lugares, y no es una casualidad de diseño:

   · Lo que es de Auth (crear la cuenta, generar el link, bloquear el ingreso, borrar) va por la
     Edge Function `admin-usuarios`, porque necesita la clave de servicio y ésa no puede pisar el
     navegador.
   · Lo que tiene que quedar AUDITADO va por RPC desde acá, con la sesión de quien está mirando la
     pantalla. Bajo la clave de servicio `auth.uid()` es NULL, así que si la Function escribiera en
     la base, el audit_log diría "acción del sistema" y se perdería quién hizo qué.

   Por eso varias de estas funciones son de DOS PASOS. Cuando el orden importa, está dicho.
   ========================================================================== */

/** Lo que devuelve `user_activity_summary` (0098), ya en camelCase. */
export interface ActividadDeCuenta {
  /** true = ninguna clave foránea bloquea el borrado, o sea la cuenta nunca hizo nada. */
  puedeEliminarse: boolean
  total: number
  /** `{tabla: cantidad}`, sólo de las que BLOQUEAN. La pantalla traduce los nombres que conoce. */
  referencias: Record<string, number>
}

/** Forma cruda del jsonb que devuelve el RPC. */
interface ActividadRow {
  puede_eliminarse: boolean
  total: number
  referencias: Record<string, number>
}

/**
 * Qué dejó atrás una persona, y si su cuenta se puede eliminar.
 *
 * ⚠️ La respuesta es una FOTO, no una garantía: entre que la pantalla pregunta y alguien pulsa
 * "Eliminar", esa persona pudo haber registrado una visita desde otra computadora. Por eso el
 * chequeo REAL es el `23503` que devuelve el borrado; esto sólo decide si el botón se habilita y
 * qué dice cuando está gris.
 */
export function useActividadDeCuenta(userId: string | null): QueryResult<ActividadRow> {
  return useSupabaseQuery<ActividadRow>((c) => {
    if (!userId) return Promise.resolve({ data: null, error: null })
    // El RPC devuelve un jsonb suelto y supabase-js, sin tipos generados, lo infiere como una fila:
    // se castea el builder a la forma que espera useSupabaseQuery. Mismo patrón que
    // `useProtocolCoordinators` en data/pharma/coordinators.ts.
    return c.rpc('user_activity_summary', { p_user_id: userId }) as unknown as
      PromiseLike<{ data: ActividadRow | null; error: PostgrestError | null }>
  }, [userId], teamReadErrorMessage)
}

/** Normaliza el jsonb del RPC. Con defaults defensivos: si la migración todavía no está aplicada y
 *  algo llega a medias, "no se puede eliminar" es el lado seguro del error. */
export function normalizarActividad(row: ActividadRow | null): ActividadDeCuenta {
  return {
    puedeEliminarse: row?.puede_eliminarse === true,
    total: row?.total ?? 0,
    referencias: row?.referencias ?? {},
  }
}

/**
 * Invoca la Edge Function y devuelve su mensaje YA EN CASTELLANO.
 *
 * El desenvuelto del error no es un adorno: `functions.invoke` devuelve
 * "Edge Function returned a non-2xx status code" y esconde el cuerpo en `error.context`. Sin leerlo,
 * el guard que dice "No tenés permiso para administrar cuentas" llegaría a la pantalla como una
 * frase en inglés sobre códigos de estado.
 */
async function invocarAdmin<T>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body })
  if (!error) return { data: data as T, error: null }

  const contexto = (error as { context?: Response }).context
  if (contexto && typeof contexto.json === 'function') {
    try {
      const cuerpo = (await contexto.json()) as { error?: string }
      if (cuerpo?.error) return { data: null, error: cuerpo.error }
    } catch {
      // El cuerpo no era JSON (un 404 de la plataforma, por ejemplo). Cae al genérico de abajo.
    }
    if (contexto.status === 404) {
      return { data: null, error: 'Falta desplegar una actualización del sistema para administrar cuentas.' }
    }
  }
  return { data: null, error: 'No pudimos completar la operación. Probá de nuevo en un momento.' }
}

/** A dónde vuelve el link. Tiene que estar en los "Redirect URLs" permitidos del proyecto
 *  (Authentication → URL Configuration) o Auth lo ignora y el link no lleva a ningún lado. */
const destinoDelLink = (): string => window.location.origin

export interface CuentaCreada {
  userId: string
  /** El link para definir la contraseña. `null` si la cuenta se creó pero el link falló. */
  actionLink: string | null
  /** Texto a mostrar cuando algo salió a medias. La cuenta SÍ existe igual. */
  aviso?: string
}

/**
 * Crea una cuenta y devuelve el link para que la persona defina su contraseña.
 *
 * Nace SIN NINGÚN ACCESO (`handle_new_user`, 0008, no asigna roles a propósito): el default seguro
 * es no ver nada. Los módulos se dan después con `setModuleAccess`, que los deja auditados.
 */
export async function crearCuenta(input: { email: string; fullName: string }): Promise<{ data: CuentaCreada | null; error: string | null }> {
  const { data, error } = await invocarAdmin<CuentaCreada>({
    accion: 'crear',
    email: input.email,
    fullName: input.fullName,
    redirectTo: destinoDelLink(),
  })
  if (error || !data) return { data: null, error: error ?? 'No pudimos crear la cuenta.' }

  /* El alta queda en el audit_log con el actor real. Si esto falla, la cuenta YA existe: se avisa
     pero no se devuelve error, porque decirle "falló" a alguien cuya cuenta sí se creó lo llevaría
     a crearla de nuevo y comerse un "ya existe". Es el mismo criterio que `stamp_email_change`. */
  const { error: errAudit } = await supabase.rpc('registrar_evento_de_cuenta', {
    p_accion: 'ALTA',
    p_user_id: data.userId,
    p_datos: { email: input.email, full_name: input.fullName },
  })

  return {
    data: errAudit ? { ...data, aviso: data.aviso ?? 'La cuenta se creó, pero no quedó registrada en la auditoría. Avisá para revisarlo.' } : data,
    error: null,
  }
}

/** Genera un link de un solo uso para que la persona defina una contraseña nueva. Nadie más que
 *  ella la elige: quien administra genera el link, no la contraseña. */
export async function generarLinkRestablecimiento(email: string): Promise<{ actionLink: string | null; error: string | null }> {
  const { data, error } = await invocarAdmin<{ actionLink: string }>({
    accion: 'link_restablecimiento',
    email,
    redirectTo: destinoDelLink(),
  })
  return { actionLink: data?.actionLink ?? null, error }
}

/**
 * Da de baja: revoca todos los accesos y bloquea el ingreso.
 *
 * EL ORDEN NO ES INTERCAMBIABLE. Primero el RPC, que revoca los módulos y es lo que corta la RLS
 * de verdad; después el bloqueo en Auth. Si el segundo paso falla, la persona puede entrar pero no
 * ve nada. Al revés dejaría permisos vigentes con la pantalla diciendo "de baja", que es la clase
 * de mentira que este proyecto no acepta.
 */
export async function darDeBaja(userId: string): Promise<{ error: string | null }> {
  const { error: errRpc } = await supabase.rpc('dar_de_baja', { p_user_id: userId })
  if (errRpc) return { error: accessErrorMessage(errRpc) }

  const { error: errBan } = await invocarAdmin({ accion: 'banear', userId })
  return { error: errBan }
}

/**
 * Elimina una cuenta de verdad. Sólo prospera si nunca hizo nada.
 *
 * `datos` es lo poco que se conserva de la cuenta en la auditoría: una vez borrada, esta línea es
 * la ÚNICA constancia de que existió. Por eso se registra después del borrado y no antes — si el
 * borrado no prospera, no hay nada que constatar.
 */
export async function eliminarCuenta(userId: string, datos: { email: string | null; full_name: string }): Promise<{ error: string | null }> {
  const { error } = await invocarAdmin({ accion: 'eliminar', userId })
  if (error) return { error }

  await supabase.rpc('registrar_evento_de_cuenta', {
    p_accion: 'ELIMINACION',
    p_user_id: userId,
    p_datos: datos,
  })
  return { error: null }
}
