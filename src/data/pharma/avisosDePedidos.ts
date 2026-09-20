import { useEffect } from 'react'
import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import type { QueryResult } from '../../lib/useSupabaseQuery'
import { addDaysISO, todayISO } from '../../lib/dates'
import type { PedidoAviso, RequestStatus } from './dispensationModel'

/**
 * Los pedidos de dispensación que alimentan la campana y sus popups.
 *
 * SE REPREGUNTA; NO HAY REALTIME. Cada 30 s mientras la pestaña está a la vista. El realtime de
 * Supabase daría el aviso instantáneo, pero exige habilitar estas tablas en la publicación a mano
 * en el dashboard de producción, manejar la reconexión cuando la notebook se suspende — y de todos
 * modos repreguntar, porque el payload trae la fila cruda, sin paciente ni protocolo. Medio minuto
 * de demora no cambia ninguna decisión: ni ir a buscar un pedido que está listo, ni ver que entró
 * uno nuevo. Ver `docs/plan-avisos-de-pedidos.md` (D1).
 */

/* El huso fijo de Argentina, igual que en `dispensations.ts`: la ventana no puede depender de la
   zona del navegador. */
const AR_OFFSET = '-03:00'

/** Cada cuánto se repregunta. */
export const INTERVALO_MS = 30_000

/**
 * Hasta cuántos días para atrás se miran los pedidos que ya no están abiertos.
 *
 * NO es la ventana que se MUESTRA —eso lo decide `pedidosVigentes`, que deja sólo los de hoy— sino
 * un techo para que la consulta no crezca con los meses: sin él, un coordinador con dos años de
 * trabajo se traería todas sus dispensaciones entregadas en cada vuelta del reloj.
 *
 * El caso que este techo deja afuera es uno solo: un pedido LISTO que nadie retiró hace más de una
 * semana. Se pierde su card, no el pedido — sigue en el tablero de Farmacia, que es donde esa
 * anomalía se resuelve.
 */
const DIAS_ATRAS = 7

/**
 * Las columnas, al hueso.
 *
 * NO SE USA `REQUEST_COLS`, y no es por rendimiento: esa lista pide columnas y embeds de la 0121,
 * 0123 y 0124, y cualquiera de ellas sin aplicar voltea la consulta ENTERA (42703 / PGRST200). Acá
 * sólo entran columnas viejas, así que esta consulta no tiene ventana de despliegue.
 *
 * Tampoco embebe `patient_visits`: Farmacia no tiene policy de select sobre esa tabla (0006:162) y
 * el join le devolvería cero filas EN SILENCIO. Por eso el código de la visita viaja desnormalizado
 * en la solicitud.
 */
const COLS =
  'id, status, updated_at, visit_id, visit_code, requested_by, ' +
  'dispensations:dispensations(status), ' +
  'enrollment:enrollments!enrollment_id(ivrs_code, patient:patients(id, full_name)), ' +
  'protocol:protocols!protocol_id(id, code)'

/** La fila como la devuelve PostgREST, antes de aplanarla. */
interface FilaCruda {
  id: string
  status: RequestStatus
  updated_at: string
  visit_id: string
  visit_code: string | null
  requested_by: string
  dispensations: { status: string }[] | null
  enrollment: { ivrs_code: string | null; patient: { id: string; full_name: string } | null } | null
  protocol: { id: string; code: string } | null
}

/* El embed puede venir nulo si a quien mira le falta el alcance para leerlo. NO se inventa un
   nombre: el guion dice "esto no lo pude ver", y "Paciente" diría que así se llama. */
function aplanar(f: FilaCruda): PedidoAviso {
  return {
    id: f.id,
    status: f.status,
    dispensacion: f.dispensations?.[0]?.status ?? null,
    updated_at: f.updated_at,
    visit_id: f.visit_id,
    visit_code: f.visit_code,
    requested_by: f.requested_by,
    patient_id: f.enrollment?.patient?.id ?? '',
    patient_name: f.enrollment?.patient?.full_name ?? '—',
    patient_code: f.enrollment?.ivrs_code ?? null,
    protocol_id: f.protocol?.id ?? '',
    protocol_code: f.protocol?.code ?? '—',
  }
}

/**
 * Los pedidos del alcance de quien mira, con su reloj.
 *
 * Son DOS o TRES consultas y no una con `or(...)`, por lo mismo que `useDispensationBoard`: los
 * filtros no son parejos. Lo abierto va SIN fecha —un pedido de ayer sin atender tiene que seguir a
 * la vista— y lo demás con techo. Meterlo todo en un `or` obligaría además a escribir un timestamp
 * con huso adentro de una cadena de PostgREST, que es justo donde se rompe sin avisar.
 */
export function usePedidosParaAvisar({ uid, verCoordinacion, verFarmacia }: {
  uid: string | null
  verCoordinacion: boolean
  verFarmacia: boolean
}): QueryResult<PedidoAviso[]> {
  const desde = addDaysISO(todayISO(), -DIAS_ATRAS)

  const query = useSupabaseQuery<PedidoAviso[]>(
    async (c) => {
      const porId = new Map<string, PedidoAviso>()

      if (verCoordinacion && uid) {
        const abiertos = await c
          .from('dispensation_requests')
          .select(COLS)
          .eq('requested_by', uid)
          .in('status', ['solicitada', 'preparando'])
          .returns<FilaCruda[]>()
        if (abiertos.error) return { data: null, error: abiertos.error }

        /* Sin filtro de estado: acá entran las atendidas (listas y entregadas), las rechazadas y
           las canceladas de los últimos días. Qué se muestra de todo eso lo decide `pedidosVigentes`,
           que es puro y está testeado. */
        const recientes = await c
          .from('dispensation_requests')
          .select(COLS)
          .eq('requested_by', uid)
          .gte('updated_at', `${desde}T00:00:00${AR_OFFSET}`)
          .returns<FilaCruda[]>()
        if (recientes.error) return { data: null, error: recientes.error }

        for (const f of [...(abiertos.data ?? []), ...(recientes.data ?? [])]) porId.set(f.id, aplanar(f))
      }

      if (verFarmacia) {
        const nuevos = await c
          .from('dispensation_requests')
          .select(COLS)
          .eq('status', 'solicitada')
          .returns<FilaCruda[]>()
        if (nuevos.error) return { data: null, error: nuevos.error }
        /* `porId` ya puede tenerlo: si lo pediste vos y sigue sin tomar, cae en las dos consultas.
           Se queda el aplanado de la primera — es la misma fila. */
        for (const f of nuevos.data ?? []) if (!porId.has(f.id)) porId.set(f.id, aplanar(f))
      }

      return { data: [...porId.values()], error: null }
    },
    [uid, verCoordinacion, verFarmacia, desde],
  )

  const { refetch } = query

  /* El reloj va ENCIMA del hook genérico y no adentro: `useSupabaseQuery` lo usa media app y no
     tiene por qué aprender a repreguntar sola. Con la pestaña oculta se apaga —consultar para nadie
     es gastar— y al volver refresca de una, sin esperar los 30 s.
     `useSupabaseQuery` ya hace stale-while-revalidate, así que el refresco de fondo no parpadea a
     "Cargando…" ni vacía la lista mientras vuelve. */
  useEffect(() => {
    let id: number | undefined
    const detener = () => {
      if (id !== undefined) { window.clearInterval(id); id = undefined }
    }
    const arrancar = () => { detener(); id = window.setInterval(refetch, INTERVALO_MS) }
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') { detener(); return }
      refetch()
      arrancar()
    }
    if (document.visibilityState === 'visible') arrancar()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      detener()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [refetch])

  return query
}
