import { useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useSupabaseQuery } from '../lib/useSupabaseQuery'
import type { QueryResult } from '../lib/useSupabaseQuery'
import { useVisitAlerts } from './visits'
import type { TrackVisitRow } from './visits'
import { useProcedureReportAlerts } from './reports'
import type { ProcedureReportAlertRow } from './reports'
import { useIpDeliveryAlerts } from './visitIp'
/* `isVisitAlertDismissed` ya no se importa acá: lo usa `activeAlertsFilter.ts`, que es donde vive
   la regla desde la 0130. Se sigue REEXPORTANDO más abajo, así que ningún consumidor cambia. */
import { descarteListo, isReportAlertDismissed } from './alertDismissalModel'
import { bumpAlertArchives, useAlertArchivesVersion } from './alertSignal'
import { alertasVigentes } from './activeAlertsFilter'
import { useDeviations } from './deviations'

/* Descartar una alerta (migración 0070).

   Las alertas no son filas: son estado calculado (`computed_status` de v_track_visits para las
   de visita, v_procedure_report_alerts para las de reporte). Así que no se borran — se ARCHIVA
   el aviso en `alert_dismissals`, con autor, fecha y motivo, y el front deja de listarlo. La
   condición clínica sigue donde estaba.

   El filtrado es acá y no en una vista de la base a propósito: una vista de "alertas vigentes"
   tendría que hacer `select *` sobre v_track_visits y quedaría con las columnas congeladas (el
   lastre que ya arrastran v_patient_visits/v_track_visits). Una alerta descartada tampoco es un
   secreto: la RLS de `alert_dismissals` espeja la de la alerta, así que quien recibe la fila es
   alguien que ya podía ver el aviso.

   Las reglas puras —tipos y los dos predicados de "está archivada"— viven en
   `alertDismissalModel.ts` para poder testearlas sin el cliente de Supabase; se reexportan desde
   acá para que los consumidores sigan importando de un solo lugar. */

export {
  descarteListo,
  DISMISS_REASONS,
  isReportAlertDismissed,
  isVisitAlertDismissed,
  MOTIVO_OTRO,
  reasonLabel,
} from './alertDismissalModel'
export type { AlertDismissalRow, AlertKind } from './alertDismissalModel'

import type { AlertDismissalRow, AlertKind } from './alertDismissalModel'

/* La señal común de "lo archivado cambió" vive en `alertSignal.ts` desde la 0130.

   Nació acá, privada, y se mudó cuando llegaron las desviaciones documentadas: las dos cosas
   archivan alertas y tienen que avisar por el MISMO canal. Con un contador propio para cada una,
   documentar una desviación releería las desviaciones y dejaría a la campana con el número viejo
   — el mismo bug que esta señal existe para evitar, entrando por la puerta de al lado. */

/**
 * Descartes visibles para el usuario (la RLS los scopea igual que a las alertas). Se traen todos:
 * son pocos y el front los usa para dos cosas a la vez — filtrar las alertas vigentes y poblar
 * el panel de "descartadas". Se relee sola cuando alguien descarta o restaura.
 */
export function useAlertDismissals(): QueryResult<AlertDismissalRow[]> {
  const version = useAlertArchivesVersion()
  return useSupabaseQuery<AlertDismissalRow[]>(
    (c) =>
      c
        .from('alert_dismissals')
        .select('*')
        .order('dismissed_at', { ascending: false })
        .returns<AlertDismissalRow[]>(),
    [version],
  )
}

/**
 * Las alertas VIGENTES de las dos clases, ya sin las archivadas, más los descartes crudos para
 * quien necesite listarlos. Existe para que el filtro viva en UN solo lugar: lo consumen la
 * campana, el resumen de Inicio y la vista de Alertas, y los tres tienen que contar lo mismo —
 * un badge que diga 22 sobre una lista de 21 es exactamente la clase de incoherencia que hace
 * desconfiar de un sistema auditable.
 */
export function useActiveAlerts() {
  const alerts = useVisitAlerts()
  const reports = useProcedureReportAlerts()
  /* La tercera clase: «IP sin entregar» (0119, D3). NO pasa por los descartes — no se archiva; la
     apagan la entrega o un cierre explícito en la visita. Por eso tampoco tiene lista "cruda": la
     vigente y la cruda son la misma. */
  const ips = useIpDeliveryAlerts()
  const dismissals = useAlertDismissals()
  /* La cuarta entrada: las desviaciones documentadas (0130). Una ventana vencida con su desvío
     explicado ya no pide acción — el pendiente era documentarla. */
  const deviations = useDeviations()

  const rows = alerts.data
  const procRows = reports.data
  const dRows = dismissals.data
  const devRows = deviations.data

  /* La regla vive en `activeAlertsFilter.ts` y no acá adentro porque decide qué ven las TRES
     pantallas de alertas y falla en silencio en los dos sentidos: de más, la lista sedimenta;
     de menos, desaparece trabajo real sin un error en consola. Adentro del useMemo no se puede
     testear. */
  const visitAlerts = useMemo<TrackVisitRow[]>(
    () => alertasVigentes(rows ?? [], dRows ?? [], devRows ?? []),
    [rows, dRows, devRows],
  )

  const reportAlerts = useMemo<ProcedureReportAlertRow[]>(() => {
    const list = procRows ?? []
    const d = dRows ?? []
    return d.length === 0 ? list : list.filter((r) => !isReportAlertDismissed(d, r))
  }, [procRows, dRows])

  return {
    visitAlerts,
    reportAlerts,
    ipAlerts: ips.data ?? [],
    dismissals: dRows ?? [],
    /** Las desviaciones documentadas crudas (para poblar su panel y marcar la visita). 0130. */
    deviations: devRows ?? [],
    /** Todas las alertas crudas, sin filtrar (para resolver de qué visita habla un descarte). */
    allVisitAlerts: rows ?? [],
    allReportAlerts: procRows ?? [],
    loading: alerts.loading || reports.loading || ips.loading || dismissals.loading || deviations.loading,
    /**
     * El error de los DESCARTES no se propaga a propósito, y desde la 0130 el de las DESVIACIONES
     * tampoco, por la misma razón. Mientras la migración que las gobierna no esté aplicada, esa
     * tabla no existe y su consulta falla — si ese error subiera, la campana, el resumen y la
     * vista de Pendientes se romperían las tres por una tabla que todavía no está. Sin descartes
     * ni desviaciones el resultado correcto es "no hay ninguno", que es exactamente lo que pasa.
     * Así el front se puede desplegar antes o después de la migración, sin ventana rota (la
     * lección de la 0068). Archivar sí avisa si falla: eso es una acción del usuario.
     */
    error: alerts.error || reports.error,
    /**
     * El error de la alerta de IP va APARTE y no en `error`: Inicio y el Resumen también leen de acá
     * y no muestran esta clase, así que una falla suya los tiraría abajo por algo que ni dibujan. Lo
     * muestra Pendientes, que es donde la lista existe.
     */
    ipError: ips.error,
    refetch: () => {
      alerts.refetch(); reports.refetch(); ips.refetch(); dismissals.refetch(); deviations.refetch()
    },
  }
}

/** Traduce el código de Postgres a un mensaje sereno para el descarte. */
function dismissErrorMessage(code: string | undefined, raw: string): string {
  /* La migración que gobierna los descartes todavía no está aplicada en esta base: PostgREST no
     encuentra la función (PGRST202) o la tabla (42P01). Es una condición de despliegue, no un
     error del usuario, así que se dice tal cual en vez de inventar una causa. Desde la 0092 el
     PGRST202 también aparece en la ventana entre el deploy del front y la migración: la firma de
     `dismiss_alert` cambió de `p_completion_id` a `p_report_definition_id`. */
  if (code === 'PGRST202' || code === '42P01' || code === 'PGRST205') {
    return 'Descartar alertas todavía no está disponible en esta base. Falta aplicar una migración.'
  }
  if (code === '42501') return 'No tenés permiso para archivar esta alerta.'
  if (code === '23505') return 'Esa alerta ya estaba archivada. Actualizá la lista.'
  if (code === '23502') return 'Falta un dato para archivar la alerta.'
  if (code === '23503') return 'La visita de esta alerta ya no existe.'
  if (code === '23514') return 'El motivo no es válido. Elegí uno de la lista.'
  return raw || 'No pudimos archivar la alerta. Probá de nuevo.'
}

export interface DismissAlertInput {
  kind: AlertKind
  visitId: string
  reason: string
  /** Obligatorio cuando el motivo es "otro" (lo exige también un check de la 0070). */
  detail?: string | null
  /** Solo para kind='reporte_procedimiento': qué reporte del estudio se archiva (0092). */
  reportDefinitionId?: string | null
}

/**
 * Archiva una alerta vía RPC `dismiss_alert` (SECURITY DEFINER): la huella de la condición la
 * calcula el servidor, así que un cliente no puede fabricar un descarte que tape una alerta
 * futura. El RPC además rechaza archivar algo que no está en alerta.
 */
export async function dismissAlert(input: DismissAlertInput): Promise<{ error: string | null }> {
  if (!input.visitId) return { error: 'No pudimos identificar la alerta. Recargá la página.' }
  /* La MISMA regla que habilita el botón en las dos pantallas, no una copia parecida: si el guard
     de acá y el de la UI se separan, o el botón queda habilitado y rebota contra la base, o corta
     algo que la pantalla ya dio por válido. Los dos mensajes distinguen los dos casos que
     `descarteListo` junta, porque el usuario no tiene por qué leer un texto genérico. */
  if (!input.reason) return { error: 'Elegí un motivo para archivar la alerta.' }
  if (!descarteListo(input.reason, input.detail ?? '')) {
    return { error: 'Contanos el motivo para poder archivarla.' }
  }
  const { error } = await supabase.rpc('dismiss_alert', {
    p_kind: input.kind,
    p_visit_id: input.visitId,
    p_reason: input.reason,
    p_report_definition_id: input.reportDefinitionId ?? null,
    p_detail: input.detail?.trim() || null,
  })
  if (error) return { error: dismissErrorMessage(error.code, error.message) }
  bumpAlertArchives()
  return { error: null }
}

/**
 * Restaura una alerta archivada borrando su descarte (la RLS decide; el delete queda en el
 * audit_log, así que el ida y vuelta es trazable). 0 filas afectadas = sin permiso, no éxito.
 */
export async function restoreAlert(dismissalId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('alert_dismissals').delete().eq('id', dismissalId).select('id')
  if (error) return { error: dismissErrorMessage(error.code, error.message) }
  if (!data || data.length === 0) return { error: 'No tenés permiso para restaurar esta alerta.' }
  bumpAlertArchives()
  return { error: null }
}
