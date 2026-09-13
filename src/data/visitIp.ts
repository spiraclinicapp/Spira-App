import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { pharmaErrorMessage } from './pharma/errors'

/** Los estados que emite `v_visit_ip_status` (0119), en su orden de prioridad. */
export type EstadoIp =
  | 'entregado'
  | 'no_corresponde'
  | 'entregado_en_otra_visita'
  | 'pedido'
  | 'rechazado'
  | 'sin_pedir'

/** Los motivos de "No corresponde" que acepta el check de `visit_ip_closures` (0119). */
export type MotivoNoCorresponde = 'discontinuo_tratamiento' | 'retirado_por_sponsor' | 'otro'

/* El producto en investigación de una visita (migración 0119, plan
   `docs/plan-dispensacion-base-e-imp.md`, Tanda 1).

   LA REGLA VIVE EN LA BASE y no acá: `v_visit_ip_status` decide el estado y la leen la fila del panel
   de Procedimientos, la alerta de 48 h y el estado de la visita (0120). Si el front la reescribiera,
   un día la fila diría "Entregado" mientras la visita sigue "con pendientes" y la campana alerta —
   sobre la misma V7. Acá sólo se lee y se traduce a palabras (`views/track/ipEstado.ts`). */

/** Fila de `v_visit_ip_status` (0119). Una por visita que lleva IP. */
export interface VisitIpStatusRow {
  visit_id: string
  enrollment_id: string
  protocol_id: string
  /** Fechada después de la 0119: sólo estas cuentan para la alerta y para cerrar la visita. */
  sellada: boolean
  estado: EstadoIp
  /** Sin entrega y sin cierre explícito. */
  abierto: boolean
  ancla: string | null
  pedido_at: string | null
  solicitantes: string[] | null
  entregado_dispensation_id: string | null
  entregado_at: string | null
  /** NULL en las entregas anteriores a la 0119, que no guardaban quién. */
  entregado_por_name: string | null
  entregado_ip_kits: number | null
  cierre: 'no_corresponde' | 'entregado_en_otra_visita' | null
  cierre_motivo: MotivoNoCorresponde | null
  cierre_detalle: string | null
  cerrado_por_name: string | null
  cerrado_at: string | null
  otra_visita_entregado_at: string | null
  otra_visita_ip_kits: number | null
  otra_visita_code: string | null
  otra_visita_name: string | null
  otra_visita_real_date: string | null
}

/** Fila de `v_ip_delivery_alerts` (0119): la alerta «IP sin entregar». Columnas espejo de las de
 *  reporte (0103), para que los filtros de Pendientes decidan igual sobre las tres listas. */
export interface IpDeliveryAlertRow {
  visit_id: string
  estado: Extract<EstadoIp, 'sin_pedir' | 'pedido' | 'rechazado'>
  ancla: string
  vence_at: string
  pedido_at: string | null
  solicitantes: string[] | null
  protocol_id: string
  patient_id: string
  protocol_code: string
  protocol_name: string
  patient_code: string | null
  patient_name: string
  visit_name: string | null
  visit_code: string | null
  real_date: string | null
  treating_physician: string | null
  coordinator_id: string | null
  coordinator_name: string | null
}

/* ┌─ Señal común de "el IP de alguna visita cambió" ───────────────────────────────────────────┐
   Sin react-query no hay caché compartida: la campana, Pendientes y el modal de la visita tienen
   cada uno su consulta. Cerrar el IP desde el modal, o pedirlo desde el panel de Dispensación de al
   lado, tiene que llegar a las tres. Mismo patrón que `dismissalsVersion` (alertDismissals.ts).
   Lo que pasa en OTRA sesión (Farmacia entrega) llega al recargar: está en TODOS.md.
   └────────────────────────────────────────────────────────────────────────────────────────────┘ */
let ipVersion = 0
const ipSubs = new Set<(v: number) => void>()

/** Avisa a todas las instancias montadas que el estado del IP pudo cambiar. */
export function bumpIpEstado(): void {
  ipVersion += 1
  for (const notify of ipSubs) notify(ipVersion)
}

function useIpVersion(): number {
  const [v, setV] = useState(ipVersion)
  useEffect(() => {
    const notify = (next: number) => setV(next)
    ipSubs.add(notify)
    setV(ipVersion)
    return () => { ipSubs.delete(notify) }
  }, [])
  return v
}

const traducir = (e: { code?: string; message: string }) => pharmaErrorMessage(e.code, e.message)

/** El estado del IP de UNA visita. `null` = la visita no lleva IP (no hay fila). */
export function useVisitIpStatus(visitId: string | null): QueryResult<VisitIpStatusRow | null> {
  const version = useIpVersion()
  return useSupabaseQuery<VisitIpStatusRow | null>(
    async (c) => {
      if (!visitId) return { data: null, error: null }
      const { data, error } = await c
        .from('v_visit_ip_status')
        .select('*')
        .eq('visit_id', visitId)
        .maybeSingle()
      if (error) return { data: null, error }
      return { data: (data as VisitIpStatusRow | null) ?? null, error: null }
    },
    [visitId, version],
    traducir,
  )
}

/** Las alertas «IP sin entregar» vigentes. RLS scopea. No se descartan (D3). */
export function useIpDeliveryAlerts(): QueryResult<IpDeliveryAlertRow[]> {
  const version = useIpVersion()
  return useSupabaseQuery<IpDeliveryAlertRow[]>(
    (c) =>
      c
        .from('v_ip_delivery_alerts')
        .select('*')
        .order('vence_at', { ascending: true })
        .returns<IpDeliveryAlertRow[]>(),
    [version],
    traducir,
  )
}

/** Una entrega de IP del mismo enrolamiento, para "Entregado en otra visita" (D11). */
export interface EntregaIpOpcion {
  dispensation_id: string
  delivered_at: string
  ip_kits: number
  visit_id: string
  visit_code: string | null
}

/**
 * Las entregas de IP del enrolamiento que podrían cubrir esta visita: entregadas, con kits, de OTRA
 * visita. El servidor vuelve a validar todo (misma persona, no de una V con IP propio, no usada por
 * otro cierre); acá sólo se arma la lista para elegir.
 */
export function useEntregasIpDelEnrolamiento(
  enrollmentId: string | null,
  visitId: string | null,
  activo: boolean,
): QueryResult<EntregaIpOpcion[]> {
  return useSupabaseQuery<EntregaIpOpcion[]>(
    async (c) => {
      if (!activo || !enrollmentId || !visitId) return { data: [], error: null }
      const { data, error } = await c
        .from('dispensation_requests')
        .select('visit_id, visit_code, dispensations:dispensations!inner(id, status, delivered_at, ip_kits)')
        .eq('enrollment_id', enrollmentId)
        .eq('includes_ip', true)
        .neq('visit_id', visitId)
        .eq('dispensations.status', 'entregada')
        .not('dispensations.ip_kits', 'is', null)
      if (error) return { data: null, error }
      const filas = (data as unknown as {
        visit_id: string
        visit_code: string | null
        dispensations: { id: string; delivered_at: string | null; ip_kits: number | null }[]
      }[] | null) ?? []
      const opciones = filas.flatMap((r) =>
        r.dispensations
          .filter((d) => d.delivered_at && d.ip_kits)
          .map((d) => ({
            dispensation_id: d.id,
            delivered_at: d.delivered_at as string,
            ip_kits: d.ip_kits as number,
            visit_id: r.visit_id,
            visit_code: r.visit_code,
          })),
      )
      // La más reciente arriba: el caso típico es la VNP de hace dos días.
      opciones.sort((a, b) => b.delivered_at.localeCompare(a.delivered_at))
      return { data: opciones, error: null }
    },
    [enrollmentId, visitId, activo],
    traducir,
  )
}

export interface CerrarIpInput {
  visitId: string
  kind: 'no_corresponde' | 'entregado_en_otra_visita'
  motivo?: MotivoNoCorresponde | null
  detalle?: string | null
  dispensationId?: string | null
}

/** Cierra el IP de la visita sin entrega propia (RPC `close_visit_ip`, 0119). */
export async function cerrarIpDeVisita(input: CerrarIpInput): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('close_visit_ip', {
    p_visit_id: input.visitId,
    p_kind: input.kind,
    p_reason: input.kind === 'no_corresponde' ? input.motivo ?? null : null,
    p_detail: input.kind === 'no_corresponde' ? input.detalle ?? null : null,
    p_dispensation_id: input.kind === 'entregado_en_otra_visita' ? input.dispensationId ?? null : null,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message) }
  bumpIpEstado()
  return { error: null }
}

/** Deshace el cierre (RPC `reopen_visit_ip`, 0119). Queda en audit_log. */
export async function reabrirIpDeVisita(visitId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('reopen_visit_ip', { p_visit_id: visitId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message) }
  bumpIpEstado()
  return { error: null }
}
