import { supabase } from '../../lib/supabase'
import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import type { InsumosReposicion, ModoReposicion } from './reposicionModel'
import type { Periodo } from './periodoDeCorte'
import type { MotivoAnulacion, MotivoCierre } from './pedidosMedicacionModel'
import type { InsumosDelPeriodo } from './reposicionPeriodoModel'
import { pharmaErrorMessage } from './errors'

/**
 * Compras del mes que viene (docs/plan-reposicion-stock-minimo.md, migración 0125).
 *
 * La lectura trae los datos CRUDOS de `insumos_de_reposicion` y la cuenta la hace
 * `reposicionModel.armarReposicion` (D11). `hoy` lo pone el llamador en hora local (AR): la función
 * usa ese día para el mes en curso, porque `current_date` en Supabase es UTC.
 */
export function useInsumosDeReposicion(hoy: string) {
  return useSupabaseQuery<InsumosReposicion>(
    async (c) => {
      const { data, error } = await c.rpc('insumos_de_reposicion', { p_hoy: hoy })
      if (error) return { data: null, error }
      return { data: data as InsumosReposicion, error: null }
    },
    [hoy],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}

type Resultado = { error: string | null; code?: string }

/**
 * Cómo se repone un medicamento del estudio (D2-D4, D25). Por función porque la tabla exige leader
 * para escribir y esto es de Farmacia operator (D12). `null` en el modo lo vuelve a «sin cargar».
 */
export async function configurarReposicion(input: {
  protocolMedicationId: string
  modo: ModoReposicion | null
  envasesPorMes: number | null
  stockFijo: number | null
}): Promise<Resultado> {
  const { error } = await supabase.rpc('configurar_reposicion', {
    p_protocol_medication_id: input.protocolMedicationId,
    p_modo: input.modo,
    p_envases_por_mes: input.modo === 'mensual' ? input.envasesPorMes : null,
    p_stock_fijo: input.modo === 'a_demanda' ? input.stockFijo : null,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/** La demora de compra de toda Farmacia (D6). Update directo: 0 filas = sin permiso (RLS). */
export async function guardarDemoraCompra(dias: number): Promise<Resultado> {
  const { data, error } = await supabase
    .from('farmacia_ajustes')
    .update({ demora_compra_dias: dias })
    .eq('unica', true)
    .select('id')
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para cambiar la demora de compra.' }
  return { error: null }
}

/** «Ya lo pedí» (D47): todo el pedido en una llamada atómica. Devuelve el grupo, para «Deshacer». */
export async function registrarPedidoReposicion(
  renglones: { protocol_id: string; medication_id: string; cantidad: number }[],
  pedidoEl: string,
): Promise<Resultado & { grupo?: string }> {
  const { data, error } = await supabase.rpc('registrar_pedido_reposicion', { p_renglones: renglones, p_pedido_el: pedidoEl })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null, grupo: data as string }
}

/** «Deshacer» un «Ya lo pedí»: borra las filas del grupo (quedan en audit_log). */
export async function anularPedidoReposicion(grupo: string): Promise<Resultado> {
  const { error } = await supabase.rpc('anular_pedido_reposicion', { p_grupo: grupo })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/**
 * La excepción del paciente a la cantidad mensual del estudio (D2). Update directo de operator
 * (policy 0050:151). NO se ofrece en asignaciones con `habilitacion_id` (D27): el trigger de la 0124
 * limpiaría la marca de «una entrega».
 */
export async function guardarEnvasesDelPaciente(patientMedicationId: string, envasesPorMes: number | null): Promise<Resultado> {
  const { data, error } = await supabase
    .from('patient_medications')
    .update({ envases_por_mes: envasesPorMes })
    .eq('id', patientMedicationId)
    .select('id')
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para modificar esta medicación.' }
  return { error: null }
}

/** Cómo se repone cada medicamento del estudio (0125), para la línea de «Editar medicación». */
export interface ReposicionDelEstudioRow {
  medication_id: string
  reposicion_modo: 'mensual' | 'a_demanda' | 'no_se_compra' | null
  envases_por_mes: number | null
}

/** Lo lee Farmacia y gerencia (RLS de protocol_medications, 0032); el modal de edición es de Farmacia. */
export function useReposicionDelEstudio(protocolId: string) {
  return useSupabaseQuery<ReposicionDelEstudioRow[]>(
    (c) =>
      c
        .from('protocol_medications')
        .select('medication_id, reposicion_modo, envases_por_mes')
        .eq('protocol_id', protocolId)
        .returns<ReposicionDelEstudioRow[]>(),
    [protocolId],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}

// ═══════════════════════════ De corte a corte (0128) ═══════════════════════════
// docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md. Lo de arriba (mes calendario, demora,
// «Ya lo pedí») es de la card de Estadísticas y se va con ella en la Parte 2.

/**
 * El día de corte de Farmacia (R4). Envuelto en un objeto porque `null` es un valor con significado
 * («sin cargar»: la pantalla lo pide) y no tiene que confundirse con «todavía no llegó».
 */
export function useDiaCorte() {
  return useSupabaseQuery<{ diaCorte: number | null }>(
    async (c) => {
      const { data, error } = await c.from('farmacia_ajustes').select('dia_corte').eq('unica', true).maybeSingle()
      if (error) return { data: null, error }
      return { data: { diaCorte: (data as { dia_corte: number | null } | null)?.dia_corte ?? null }, error: null }
    },
    [],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}

/**
 * Los datos crudos de un período (`reposicion_del_periodo`, 0128). La cuenta la hace
 * `armarReposicionDelPeriodo` (D11). Sin período todavía (falta el día de corte) no pide nada.
 * `protocolId` null = todos los estudios no cerrados (la grilla).
 */
export function useReposicionDelPeriodo(periodo: Periodo | null, protocolId: string | null = null) {
  return useSupabaseQuery<InsumosDelPeriodo | null>(
    async (c) => {
      if (!periodo) return { data: null, error: null }
      const { data, error } = await c.rpc('reposicion_del_periodo', {
        p_desde: periodo.desde,
        p_hasta: periodo.hasta,
        p_protocol_id: protocolId,
      })
      if (error) return { data: null, error }
      return { data: data as InsumosDelPeriodo, error: null }
    },
    // Los bordes y no el objeto: un período recalculado en cada render cambia de identidad.
    [periodo?.desde, periodo?.hasta, protocolId],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}

/** El día de corte (R4). Update directo: 0 filas = sin permiso (RLS). */
export async function guardarDiaCorte(dia: number): Promise<Resultado> {
  const { data, error } = await supabase
    .from('farmacia_ajustes')
    .update({ dia_corte: dia })
    .eq('unica', true)
    .select('id')
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para cambiar el día de corte.' }
  return { error: null }
}

/** «Emitir e imprimir» (R8): cabecera y renglones en una llamada atómica. Devuelve el número para la hoja. */
export async function emitirPedidoMedicacion(input: {
  protocolId: string
  /** El período PARA el que se pide (P1). */
  periodo: Periodo
  /** Hoy en hora AR. */
  emitidoEl: string
  renglones: { medication_id: string; calculado: number | null; pedido: number }[]
}): Promise<Resultado & { id?: string; numero?: number }> {
  const { data, error } = await supabase.rpc('emitir_pedido_medicacion', {
    p_protocol_id: input.protocolId,
    p_desde: input.periodo.desde,
    p_hasta: input.periodo.hasta,
    p_emitido_el: input.emitidoEl,
    p_renglones: input.renglones,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  const r = data as { id: string; numero: number }
  return { error: null, id: r.id, numero: r.numero }
}

/** Anular un pedido emitido (R9). La base lo rechaza si ya tiene recepciones. */
export async function anularPedidoMedicacion(pedidoId: string, motivo: MotivoAnulacion): Promise<Resultado> {
  const { error } = await supabase.rpc('anular_pedido_medicacion', { p_pedido_id: pedidoId, p_motivo: motivo })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/** «No va a llegar» (R11): cierra lo que falta de un renglón, que vuelve a la compra. */
export async function cerrarFaltantePedido(itemId: string, motivo: MotivoCierre): Promise<Resultado> {
  const { error } = await supabase.rpc('cerrar_faltante_pedido', { p_item_id: itemId, p_motivo: motivo })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}
